import React, { useState, useEffect } from 'react';
import { DailyFolder, Note } from '@/app/lib/mockData';
import { ChevronLeft, Star, MoreHorizontal, Archive, Trash2, X, Inbox, RefreshCcw, ChevronRight, Zap, Settings, Radio } from 'lucide-react';
import { format, addHours, differenceInMinutes } from 'date-fns';
import { clsx } from 'clsx';
import { TranscriptionsTab } from '@/app/components/tabs/TranscriptionsTab';
import { NotesTab } from '@/app/components/tabs/NotesTab';
import { AudioTab } from '@/app/components/tabs/AudioTab';
import { AIChatTab } from '@/app/components/tabs/AIChatTab';
import { NoteDetailView } from '@/app/views/NoteDetailView';
import { Drawer } from 'vaul';
import { motion } from 'motion/react';

interface FolderDetailProps {
  folder: DailyFolder;
  onBack: () => void;
  onToggleStar: () => void;
  initialTab?: 'transcription' | 'notes' | 'audio' | 'ai';
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onOpenRecordingSettings?: () => void;
  onUpdateFolder?: (folder: DailyFolder) => void;
}

export const FolderDetail: React.FC<FolderDetailProps> = ({ 
    folder, 
    onBack, 
    onToggleStar, 
    initialTab = 'transcription',
    onArchive,
    onTrash,
    onOpenRecordingSettings,
    onUpdateFolder
}) => {
  const mapInitialTab = (t: string) => {
      if (t === 'transcription') return 'transcriptions';
      if (t === 'ai') return 'chat';
      return t;
  };

  const [activeTab, setActiveTab] = useState<'notes' | 'transcriptions' | 'audio' | 'chat'>('notes');
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  
  // Local state for notes to support adding new ones
  const [currentNotes, setCurrentNotes] = useState(folder.notes);
  
  useEffect(() => {
      setCurrentNotes(folder.notes);
  }, [folder.notes]);

  useEffect(() => {
    // If no specific initial tab is requested, default to 'notes'
    if (initialTab === 'transcription') {
        setActiveTab('transcriptions'); // Handle legacy/default passing
    } else {
        setActiveTab(mapInitialTab(initialTab) as any);
    }
  }, [initialTab]);

  const tabs = [
    { id: 'notes', label: 'Notes' },
    { id: 'transcriptions', label: 'Transcript' },
    { id: 'audio', label: 'Audio' },
    { id: 'chat', label: 'AI' },
  ] as const;

  const handleAction = (action: 'archive' | 'trash') => {
      setIsOptionsOpen(false);
      if (action === 'archive') onArchive(folder.id);
      if (action === 'trash') onTrash(folder.id);
  };

  const handleGenerateSummary = (startHour: Date) => {
      // Mock generation for Hour (Legacy logic kept for Transcript tab sparkler)
      const endHour = addHours(startHour, 1);
      handleGenerateNoteFromRange(startHour, endHour, `Hourly Summary`);
  };

  const handleGenerateNoteFromRange = (start: Date, end: Date, defaultTitle?: string) => {
      const timeRange = `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
      const durationMins = differenceInMinutes(end, start);
      
      const newNote: Note = {
          id: `gen_${Date.now()}`,
          title: defaultTitle || `Summary (${durationMins}m)`,
          createdAt: format(new Date(), 'h:mm a'),
          updatedAt: 'Saved just now',
          summary: 'Overview of the discussion captured in the selected time range.',
          content: `<b>Overview</b>
This note covers the discussion from ${timeRange}.

<b>Key Points</b>
• Point 1 derived from transcript...
• Point 2 derived from transcript...
• Point 3 derived from transcript...

<b>Decisions</b>
• No major decisions detected in this segment.

<b>Next Steps</b>
• Review the full recording for more context.`,
          decisions: [],
          actionItems: [],
          source: 'AI',
          timeRange: timeRange
      };
      
      const newNotes = [newNote, ...currentNotes];
      setCurrentNotes(newNotes);
      onUpdateFolder?.({ ...folder, notes: newNotes });
      
      // If we are in Notes tab, open it immediately
      // If we are in Transcript tab, switch to Notes tab
      setActiveTab('notes');
      setSelectedNote(newNote); 
  };

  const handleAddManualNote = () => {
      const newNote: Note = {
          id: `man_${Date.now()}`,
          title: 'New Note',
          createdAt: format(new Date(), 'h:mm a'),
          updatedAt: 'Saved just now',
          summary: 'Tap to edit this note...',
          content: '', 
          decisions: [],
          actionItems: [],
          source: 'Manual',
          timeRange: format(new Date(), 'h:mm a')
      };
      const newNotes = [newNote, ...currentNotes];
      setCurrentNotes(newNotes);
      onUpdateFolder?.({ ...folder, notes: newNotes });
      setSelectedNote(newNote); // Open it immediately
  };

  if (selectedNote) {
      return (
          <NoteDetailView 
            note={selectedNote} 
            onBack={() => setSelectedNote(null)} 
            onDelete={() => {
                const newNotes = currentNotes.filter(n => n.id !== selectedNote.id);
                setCurrentNotes(newNotes);
                onUpdateFolder?.({ ...folder, notes: newNotes });
                setSelectedNote(null);
            }}
          />
      );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black transition-colors">
      {/* Header */}
      {/* Added pt-20 to match Home page spacing request */}
      <div className="pt-[60px] sticky top-0 z-30 bg-white dark:bg-black border-b border-zinc-100 dark:border-zinc-800 transition-colors">
          <div className="px-6 h-14 flex items-center justify-between">
            <button 
                onClick={onBack} 
                className="p-2 -ml-2 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
                <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            
            <div className="flex flex-col items-center">
                <span className="font-semibold text-sm text-zinc-900 dark:text-white leading-tight">
                    {format(folder.date, 'MMMM d, yyyy')}
                </span>
            </div>

            <div className="flex items-center gap-1">
                <button onClick={onToggleStar} className={clsx("p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors", folder.isStarred ? "text-yellow-500" : "text-zinc-400 dark:text-zinc-400")}>
                    <Star size={20} fill={folder.isStarred ? 'currentColor' : 'none'} strokeWidth={1.5} />
                </button>
                <button 
                    onClick={() => setIsOptionsOpen(true)}
                    className="p-2 -mr-2 text-zinc-400 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                    <MoreHorizontal size={20} strokeWidth={1.5} />
                </button>
            </div>
          </div>
          
          {/* Minimal Tabs */}
          <div className="px-6 flex gap-8 border-b border-transparent">
              {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={clsx(
                            "pb-3 text-sm font-medium transition-colors relative",
                            isActive ? "text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                        )}
                      >
                          {tab.label}
                          {isActive && (
                              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-900 dark:bg-white rounded-full" />
                          )}
                      </button>
                  )
              })}
          </div>

          {/* Subtle Status Indicator - Moved BELOW tabs - Updated for Light Gray + Red SVG */}
          {folder.isTranscribing && (
                <div className="px-6 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                    <div className="flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="text-red-500 fill-current">
                            <rect x="1" y="6" width="2.8" height="12">
                                <animate attributeName="y" begin="0s" dur="1s" values="6;1;6" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite" />
                                <animate attributeName="height" begin="0s" dur="1s" values="12;22;12" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite" />
                            </rect>
                            <rect x="5.8" y="6" width="2.8" height="12">
                                <animate attributeName="y" begin="0.2s" dur="1s" values="6;1;6" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite" />
                                <animate attributeName="height" begin="0.2s" dur="1s" values="12;22;12" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite" />
                            </rect>
                            <rect x="10.6" y="6" width="2.8" height="12">
                                <animate attributeName="y" begin="0.4s" dur="1s" values="6;1;6" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite" />
                                <animate attributeName="height" begin="0.4s" dur="1s" values="12;22;12" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite" />
                            </rect>
                        </svg>
                        <span 
                            className="text-[10px] font-bold bg-gradient-to-r from-red-600 via-red-400 to-red-600 bg-[length:200%_auto] bg-clip-text text-transparent animate-shimmer"
                            style={{ animation: 'shimmer 2s linear infinite' }}
                        >
                            Transcribing now
                        </span>
                        <style>{`
                            @keyframes shimmer {
                                0% { background-position: -200% center; }
                                100% { background-position: 200% center; }
                            }
                        `}</style>
                    </div>
                </div>
            )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-black transition-colors scrollbar-hide">
          <div className="h-full">
              {activeTab === 'transcriptions' && (
                  <TranscriptionsTab 
                    transcriptions={folder.transcriptions} 
                    onGenerateSummary={handleGenerateSummary}
                  />
              )}
              {activeTab === 'notes' && (
                  <NotesTab 
                    notes={currentNotes} 
                    onAddNote={handleAddManualNote}
                    onGenerateNote={(start, end) => handleGenerateNoteFromRange(start, end)}
                    onNoteClick={setSelectedNote}
                    folderDate={folder.date}
                  />
              )}
              {activeTab === 'audio' && <AudioTab recordings={folder.audio} />}
              {activeTab === 'chat' && <AIChatTab date={folder.date} />}
          </div>
      </div>

      {/* Options Drawer */}
      <Drawer.Root open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
        <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
            <Drawer.Content className="bg-white dark:bg-zinc-900 flex flex-col rounded-t-2xl mt-24 fixed bottom-0 left-0 right-0 z-50 max-w-[480px] mx-auto outline-none">
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <Drawer.Title className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Folder Actions</Drawer.Title>
                    <Drawer.Description className="sr-only">Actions for this folder</Drawer.Description>
                    <button onClick={() => setIsOptionsOpen(false)} className="p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                        <X size={20} className="text-zinc-400" />
                    </button>
                </div>
                
                <div className="p-2">
                    <button 
                        onClick={() => handleAction('archive')}
                        className="w-full flex items-center gap-4 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-colors text-left"
                    >
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-900 dark:text-zinc-100">
                            {folder.isArchived ? (
                                <Inbox size={20} strokeWidth={1.5} />
                            ) : (
                                <Archive size={20} strokeWidth={1.5} />
                            )}
                        </div>
                        <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                            {folder.isArchived ? 'Unarchive Folder' : 'Archive Folder'}
                        </span>
                    </button>
                    
                    <button 
                        onClick={() => handleAction('trash')}
                        className="w-full flex items-center gap-4 p-4 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors text-left group"
                    >
                        <div className="w-10 h-10 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center text-red-600 dark:text-red-400">
                            {folder.isTrashed ? (
                                <RefreshCcw size={20} strokeWidth={1.5} />
                            ) : (
                                <Trash2 size={20} strokeWidth={1.5} />
                            )}
                        </div>
                        <span className="text-base font-medium text-red-600 dark:text-red-400">
                             {folder.isTrashed ? 'Restore from Trash' : 'Trash'}
                        </span>
                    </button>
                </div>
                <div className="h-6" /> 
            </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
};
