import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut, updateEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AppUser extends FirebaseUser {
  role?: 'admin' | 'chidoan' | 'doanvien';
  branch?: string;
  mssv?: string;
  name?: string;
  avatar?: string;
  committeeRole?: string;
  branchRole?: string;
  committeeTerm?: string;
}

interface AuthContextType {
  currentUser: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateUserProfile: (data: { name: string; mssv: string; branch: string; email?: string }) => Promise<void>;
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
          
          const adminEmails = ['dkdtvt.hcmus@gmail.com', 'dinhtienanh.hcmus@gmail.com'];
          const userEmailLower = firebaseUser.email?.toLowerCase() || '';
          const isDefaultAdmin = adminEmails.includes(userEmailLower);
          
          const isBranchAccount = 
            userEmailLower.endsWith('@chidoan.fetel') || 
            userEmailLower.includes('chidoan') ||
            userEmailLower.endsWith('.fetel');

          const getBranchFromEmail = (email: string) => {
            if (!email) return 'Chi đoàn';
            const prefix = email.split('@')[0].toLowerCase();
            let clean = prefix.replace('.fetel', '').replace('chidoan', '').replace(/^[._-]+|[._-]+$/g, '');
            if (!clean) return 'Chi đoàn';
            return clean.toUpperCase();
          };

          const extractedBranch = isBranchAccount ? getBranchFromEmail(userEmailLower) : '';
          
          let appUser: AppUser = firebaseUser;
          
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            let role: 'admin' | 'chidoan' | 'doanvien' = 'doanvien';
            if (isDefaultAdmin) {
              role = 'admin';
            } else if (isBranchAccount || data.role === 'chidoan') {
              role = 'chidoan';
            } else {
              role = data.role || 'doanvien';
            }
            
            const defaultName = isDefaultAdmin 
              ? (data.name && data.name !== 'Admin ĐTVT' ? data.name : 'BCH Đoàn khoa ĐTVT')
              : isBranchAccount
              ? (data.name && data.name !== 'Đoàn viên' ? data.name : `BCH Chi đoàn ${extractedBranch || data.branch || ''}`)
              : (data.name || firebaseUser.displayName || 'Đoàn viên');
            
            const defaultCommitteeRole = data.committeeRole || (isBranchAccount ? 'Chi đoàn' : '');
            const defaultBranchRole = data.branchRole || '';
            const defaultBranch = isBranchAccount 
              ? (extractedBranch || data.branch || 'Chi đoàn')
              : (data.branch || 'Đoàn khoa ĐTVT');

            appUser = {
              ...firebaseUser,
              role,
              branch: defaultBranch,
              mssv: isBranchAccount ? '' : data.mssv,
              name: defaultName,
              committeeRole: defaultCommitteeRole,
              branchRole: defaultBranchRole,
              committeeTerm: data.committeeTerm || '',
              avatar: data.avatar || firebaseUser.photoURL || undefined,
            };

            // Sync database profile if needed for admin or branch account
            if ((isDefaultAdmin && data.role !== 'admin') || (isBranchAccount && (data.role !== 'chidoan' || data.branch !== defaultBranch))) {
              await setDoc(userDocRef, {
                email: firebaseUser.email || userEmailLower,
                name: defaultName,
                role: isDefaultAdmin ? 'admin' : 'chidoan',
                branch: defaultBranch,
                updatedAt: Date.now()
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

            let defaultRole: 'admin' | 'chidoan' | 'doanvien' = 'doanvien';
            if (isDefaultAdmin) defaultRole = 'admin';
            else if (isBranchAccount) defaultRole = 'chidoan';

            const defaultBranchName = isBranchAccount 
              ? (extractedBranch || matchedProfile?.branch || 'Chi đoàn')
              : (matchedProfile?.branch || 'Đoàn khoa ĐTVT');

            const defaultName = isDefaultAdmin 
              ? 'BCH Đoàn khoa ĐTVT' 
              : isBranchAccount
              ? `BCH Chi đoàn ${defaultBranchName}`
              : (matchedProfile?.name || firebaseUser.displayName || userEmailLower.split('@')[0] || 'Đoàn viên');

            const defaultCommitteeRole = isBranchAccount ? 'Chi đoàn' : (matchedProfile?.committeeRole || '');

            const newUserData = {
              email: firebaseUser.email || '',
              name: defaultName,
              mssv: isBranchAccount ? '' : (matchedProfile?.mssv || mssvFromEmail || ''),
              role: defaultRole,
              branch: defaultBranchName,
              committeeRole: defaultCommitteeRole,
              committeeTerm: matchedProfile?.committeeTerm || '',
              avatar: firebaseUser.photoURL || '',
              createdAt: Date.now()
            };

            try {
              await setDoc(userDocRef, newUserData);
              appUser = {
                ...firebaseUser,
                role: defaultRole,
                name: newUserData.name,
                branch: newUserData.branch,
                mssv: newUserData.mssv,
                avatar: firebaseUser.photoURL || undefined,
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

  const updateUserProfile = async (data: { name: string; mssv: string; branch: string; email?: string }) => {
    if (!auth.currentUser) return;
    const userDocRef = doc(db, 'users', auth.currentUser.uid);
    const userEmailLower = auth.currentUser.email?.toLowerCase() || '';
    const adminEmails = ['dkdtvt.hcmus@gmail.com'];
    const isDefaultAdmin = adminEmails.includes(userEmailLower);

    let newEmail = auth.currentUser.email || '';
    if (data.email && data.email.trim() && data.email.trim() !== auth.currentUser.email) {
      newEmail = data.email.trim();
      try {
        await updateEmail(auth.currentUser, newEmail);
      } catch (err) {
        console.warn("Could not update auth email directly (may require recent login):", err);
      }
    }

    const updatedData: any = {
      email: newEmail,
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
        email: newEmail,
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

