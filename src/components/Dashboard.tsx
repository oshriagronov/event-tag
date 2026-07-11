import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { PrivacyBanner } from './PrivacyBanner';
import { FolderPlus, Calendar, Image as ImageIcon, Users, Trash2, ArrowLeft } from 'lucide-react';

interface DashboardProps {
  onSelectEvent: (id: number) => void;
}

export function Dashboard({ onSelectEvent }: DashboardProps) {
  const [newEventName, setNewEventName] = useState('');

  // Fetch events along with their live photo and cluster statistics
  const events = useLiveQuery(async () => {
    const list = await db.events.reverse().toArray();
    const withStats = [];
    for (const item of list) {
      if (item.id === undefined) continue;
      const photoCount = await db.photos.where({ eventId: item.id }).count();
      const clusterCount = await db.clusters.where({ eventId: item.id }).count();
      withStats.push({
        ...item,
        photoCount,
        clusterCount,
      });
    }
    return withStats;
  });

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newEventName.trim();
    if (!name) return;

    const eventId = await db.events.add({
      name,
      createdAt: Date.now(),
    });

    setNewEventName('');
    onSelectEvent(eventId);
  };

  const handleDeleteEvent = async (id: number, name: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering event selection
    if (!confirm(`האם אתה בטוח שברצונך למחוק את האירוע "${name}"?\nפעולה זו תמחק לצמיתות את כל התמונות והפנים שנותחו עבור אירוע זה.`)) {
      return;
    }

    await db.transaction('rw', [db.events, db.photos, db.faces, db.clusters], async () => {
      await db.events.delete(id);
      await db.photos.where({ eventId: id }).delete();
      await db.faces.where({ eventId: id }).delete();
      await db.clusters.where({ eventId: id }).delete();
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex-grow flex flex-col gap-8 transition-colors duration-300">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 dark:from-amber-500 dark:to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 dark:shadow-amber-600/30">
              <Users className="w-6 h-6 text-amber-900 dark:text-white" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white m-0">EventTag</h1>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-relaxed">
            מערכת חכמה לניהול ואיתור אורחים בגלריות אירועים, באלגנטיות ופרטיות מוחלטת.
          </p>
        </div>
        
        {/* Create new event form */}
        <form onSubmit={handleCreateEvent} className="flex gap-2 shrink-0">
          <input
            type="text"
            value={newEventName}
            onChange={(e) => setNewEventName(e.target.value)}
            placeholder="שם האירוע (למשל: חתונת יוסי ודנה 2026)"
            required
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-amber-400 dark:focus:border-amber-500 focus:outline-none text-slate-800 dark:text-slate-100 text-sm w-72 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors shadow-sm"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 font-medium text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-900/5 dark:shadow-amber-500/20 active:scale-95 border border-amber-200 dark:border-amber-600/30"
          >
            <FolderPlus className="w-4 h-4" />
            <span>אירוע חדש</span>
          </button>
        </form>
      </div>

      <PrivacyBanner />

      {/* Events Grid */}
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 m-0">האירועים שלי</h2>
        
        {!events ? (
          <div className="text-center py-12 text-slate-500">טוען אירועים...</div>
        ) : events.length === 0 ? (
          <div className="border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4 bg-white/50 dark:bg-slate-900/20 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center text-slate-400 dark:text-slate-500">
              <FolderPlus className="w-6 h-6" />
            </div>
            <div className="max-w-md">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 text-lg">אין אירועים פעילים</h3>
              <p className="text-slate-500 text-sm mt-1">
                לא נוצרו עדיין אירועים. הזן שם לאירוע חדש למעלה ולחץ על "אירוע חדש" כדי להתחיל.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <div
                key={event.id}
                onClick={() => event.id !== undefined && onSelectEvent(event.id)}
                className="group relative border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-500/40 bg-white dark:bg-slate-900/60 rounded-2xl p-6 cursor-pointer transition-all duration-300 flex flex-col gap-6 shadow-sm hover:shadow-xl dark:shadow-none hover:-translate-y-1"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => event.id !== undefined && handleDeleteEvent(event.id, event.name, e)}
                  title="מחק אירוע"
                  className="absolute top-4 left-4 p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 hover:bg-red-50 dark:hover:bg-red-500/20 border border-slate-200 dark:border-slate-800 hover:border-red-200 dark:hover:border-red-500/30 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 cursor-pointer shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex flex-col gap-1.5 pr-1">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors line-clamp-1">
                    {event.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(event.createdAt).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-auto">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">תמונות</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{event.photoCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">אורחים מזוהים</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{event.clusterCount}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 mt-2 self-start hover:underline">
                  <span>פתח אירוע</span>
                  <ArrowLeft className="w-3.5 h-3.5 transform group-hover:-translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
