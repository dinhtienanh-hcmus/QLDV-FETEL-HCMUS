import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function HandbookScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);

  useEffect(() => {
    fetchTopics();
  }, []);

  const fetchTopics = async () => {
    try {
      const q = query(collection(db, 'handbook_topics'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTopics(data);
    } catch (err) {
      console.error(err);
    }
  };

  const toggle = (id: string) => {
     setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div 
        className="relative text-white p-6 pt-10 shrink-0 overflow-hidden bg-cover bg-center shadow-lg shadow-red-950/20"
        style={{ backgroundImage: `url('/background.webp')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-red-600 to-rose-700 opacity-95 backdrop-blur-[1px]" />
        {/* Soft decorative ambient lighting */}
        <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-black/25 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-lg font-bold drop-shadow-sm">Sổ tay Đoàn viên</h2>
          <p className="text-[11px] text-red-100 opacity-90 mt-0.5 font-medium">Cẩm nang kiến thức Đoàn - Hội</p>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-3 bg-slate-50 overflow-y-auto no-scrollbar pb-10">
        {topics.length === 0 ? (
          <p className="text-center text-slate-500 text-xs italic mt-10">Chưa có nội dung sổ tay.</p>
        ) : (
          topics.map((topic, index) => {
            const isExpanded = expandedId === topic.id;
            return (
              <div key={topic.id} className="flex flex-col">
                <button
                  onClick={() => toggle(topic.id)}
                  className={`flex items-center space-x-3 p-4 bg-white rounded-xl shadow-sm border focus:outline-none cursor-pointer transition text-left ${
                    isExpanded ? 'border-slate-200 border-l-4 border-l-red-600' : 'border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                    isExpanded ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-600'
                  }`}>
                    {index % 4 === 0 ? '🏛️' : index % 4 === 1 ? '📜' : index % 4 === 2 ? '🎵' : '⚙️'}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-800">{topic.title}</div>
                    <div className={`text-[9px] mt-0.5 ${isExpanded ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                      {isExpanded ? `Đang xem • ${topic.title}` : 'Nhấn để xem chi tiết'}
                    </div>
                  </div>
                  <div className={isExpanded ? 'text-red-600' : 'text-slate-300'}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[800px] opacity-100 mt-[-10px]' : 'max-h-0 opacity-0 overflow-hidden mt-0'}`}>
                  <div className="p-4 pt-5 bg-blue-50 rounded-b-xl border border-t-0 border-blue-100">
                    <p className="text-[10px] leading-relaxed text-slate-600 italic whitespace-pre-line">
                      {topic.content}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
