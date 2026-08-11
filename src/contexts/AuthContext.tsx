import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AppUser extends FirebaseUser {
  role?: 'admin' | 'chidoan' | 'doanvien';
  branch?: string;
  mssv?: string;
  name?: string;
  avatar?: string;
}

interface AuthContextType {
  currentUser: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateUserProfile: (data: { name: string; mssv: string; branch: string }) => Promise<void>;
  updateUserAvatar: (avatarUrl: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
  logout: async () => {},
  updateUserProfile: async () => {},
  updateUserAvatar: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch user data from Firestore
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          const adminEmails = ['dinhtienanh.hcmus@gmail.com', 'dkdtvt.hcmus@gmail.com'];
          const userEmailLower = firebaseUser.email?.toLowerCase() || '';
          const isDefaultAdmin = adminEmails.includes(userEmailLower);
          
          let appUser: AppUser = firebaseUser;
          
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            const role = isDefaultAdmin ? 'admin' : (data.role || 'doanvien');
            
            appUser = {
              ...firebaseUser,
              role,
              branch: data.branch || (isDefaultAdmin ? 'Đoàn khoa ĐTVT' : undefined),
              mssv: data.mssv,
              name: data.name || firebaseUser.displayName || 'Admin ĐTVT',
              avatar: data.avatar,
            };

            // If it's a default admin but Firestore didn't have admin role set, sync it
            if (isDefaultAdmin && data.role !== 'admin') {
              await setDoc(userDocRef, {
                email: firebaseUser.email || userEmailLower,
                name: data.name || firebaseUser.displayName || 'BCH Đoàn khoa ĐTVT',
                role: 'admin',
                branch: data.branch || 'Đoàn khoa ĐTVT',
                createdAt: data.createdAt || Date.now()
              }, { merge: true });
            }
          } else {
            // First time login - Check if pre-imported profile exists
            let matchedProfile: any = null;
            let mssvFromEmail = '';
            
            if (userEmailLower.includes('@student.hcmus.edu.vn')) {
              mssvFromEmail = userEmailLower.split('@')[0].trim();
            }

            if (mssvFromEmail) {
              const profileRef = doc(db, 'users', `profile_${mssvFromEmail}`);
              const profileSnap = await getDoc(profileRef);
              if (profileSnap.exists()) {
                matchedProfile = profileSnap.data();
                try {
                  await deleteDoc(profileRef);
                } catch (e) {
                  console.error(e);
                }
              }
            }

            const newUserData = {
              email: firebaseUser.email || '',
              name: matchedProfile?.name || firebaseUser.displayName || (isDefaultAdmin ? 'BCH Đoàn khoa ĐTVT' : userEmailLower.split('@')[0] || 'Đoàn viên'),
              mssv: matchedProfile?.mssv || mssvFromEmail || '',
              role: isDefaultAdmin ? 'admin' : 'doanvien',
              branch: matchedProfile?.branch || (isDefaultAdmin ? 'Đoàn khoa ĐTVT' : ''),
              committeeRole: matchedProfile?.committeeRole || '',
              committeeTerm: matchedProfile?.committeeTerm || '',
              createdAt: Date.now()
            };

            try {
              await setDoc(userDocRef, newUserData);
              appUser = {
                ...firebaseUser,
                role: isDefaultAdmin ? 'admin' : 'doanvien',
                name: newUserData.name,
                branch: newUserData.branch,
                mssv: newUserData.mssv,
              };
            } catch (err) {
              console.error("Error creating user profile:", err);
            }
          }
          setCurrentUser(appUser);
        } catch (error) {
          console.error("Error fetching user data", error);
          setCurrentUser(firebaseUser as AppUser);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const logout = () => {
    return signOut(auth);
  };

  const updateUserProfile = async (data: { name: string; mssv: string; branch: string }) => {
    if (!auth.currentUser) return;
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const userEmailLower = auth.currentUser.email?.toLowerCase() || '';
    const adminEmails = ['dinhtienanh.hcmus@gmail.com', 'dkdtvt.hcmus@gmail.com'];
    const isDefaultAdmin = adminEmails.includes(userEmailLower);

    const updatedData: any = {
      email: auth.currentUser.email || '',
      name: data.name,
      role: isDefaultAdmin ? 'admin' : (currentUser?.role || 'doanvien'),
      branch: data.branch,
      mssv: data.mssv,
      createdAt: currentUser ? (currentUser as any).createdAt || Date.now() : Date.now(),
      updatedAt: Date.now(),
    };

    await setDoc(userDocRef, updatedData, { merge: true });

    setCurrentUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        name: data.name,
        mssv: data.mssv,
        branch: data.branch,
      };
    });
  };

  const updateUserAvatar = async (avatarUrl: string) => {
    if (!auth.currentUser) return;
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    await setDoc(userDocRef, {
      avatar: avatarUrl,
      updatedAt: Date.now(),
    }, { merge: true });

    setCurrentUser((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        avatar: avatarUrl,
      };
    });
  };

  const value = {
    currentUser,
    loading,
    logout,
    updateUserProfile,
    updateUserAvatar,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

