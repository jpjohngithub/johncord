import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { useServerStore } from './stores/useServerStore';
import { useFriendStore } from './stores/useFriendStore';
import { useChatStore } from './stores/useChatStore';
import { useVoiceStore } from './stores/useVoiceStore';
import { useWebRTC } from './hooks/useWebRTC';

// Auth Screen
import { AuthScreen } from './components/auth/AuthScreen';

// Sidebars & Main Panels
import { ServerSidebar } from './components/server/ServerSidebar';
import { ChannelSidebar } from './components/server/ChannelSidebar';
import { MemberList } from './components/server/MemberList';
import { ChatArea } from './components/chat/ChatArea';
import { ThreadPanel } from './components/chat/ThreadPanel';
import { VoiceRoom } from './components/voice/VoiceRoom';

// DM Panels
import { DMSidebar } from './components/dm/DMSidebar';
import { FriendsDashboard } from './components/dm/FriendsDashboard';
import { DMChatArea } from './components/dm/DMChatArea';
import { IncomingCallModal } from './components/dm/IncomingCallModal';

// Modals
import { CreateServerModal } from './components/modals/CreateServerModal';
import { JoinServerModal } from './components/modals/JoinServerModal';
import { CreateChannelModal } from './components/modals/CreateChannelModal';
import { CreateCategoryModal } from './components/modals/CreateCategoryModal';
import { InviteModal } from './components/modals/InviteModal';
import { ServerSettingsModal } from './components/modals/ServerSettingsModal';
import { UserSettingsModal } from './components/modals/UserSettingsModal';
import { UserProfileModal } from './components/modals/UserProfileModal';
import { User } from './types';

export const App: React.FC = () => {
  const { user, token, isLoading: isAuthLoading, initializeAuth } = useAuthStore();
  const { currentServerId, currentChannel, loadServers } = useServerStore();
  const { currentDMId, loadFriends, loadDMs, setupFriendSocketListeners } = useFriendStore();
  const { setupSocketListeners } = useChatStore();
  const { currentVoiceChannel, setupVoiceSocketListeners } = useVoiceStore();

  // Initialize WebRTC signaling and microphone volume analyser
  useWebRTC();

  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);

  // Initialize Auth on App Load
  useEffect(() => {
    initializeAuth();
  }, []);

  // When Authenticated, load servers, friends, DMs, and socket event listeners
  useEffect(() => {
    if (user && token) {
      loadServers();
      loadFriends();
      loadDMs();

      const cleanupChat = setupSocketListeners();
      const cleanupFriends = setupFriendSocketListeners();
      const cleanupVoice = setupVoiceSocketListeners();

      return () => {
        cleanupChat();
        cleanupFriends();
        cleanupVoice();
      };
    }
  }, [user?.id, token]);

  // Loading Screen
  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#1e1f22]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#5865f2] border-t-transparent shadow-lg shadow-[#5865f2]/20" />
          <div className="font-bold text-sm text-[#dbdee1] tracking-wider animate-pulse">
            Carregando Johncord...
          </div>
        </div>
      </div>
    );
  }

  // Not Logged In
  if (!user || !token) {
    return <AuthScreen />;
  }

  // Determine if in voice channel view
  const isViewingVoiceRoom = currentChannel?.type === 'voice' || (currentVoiceChannel && currentChannel?.id === currentVoiceChannel.id);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1e1f22] text-[#dbdee1]">
      {/* 1. Leftmost Server Sidebar */}
      <ServerSidebar />

      {/* 2. Middle Left Sidebar: ChannelSidebar (if server selected) or DMSidebar (if DMs) */}
      {currentServerId !== null ? (
        <ChannelSidebar onOpenUserSettings={() => setIsUserSettingsOpen(true)} />
      ) : (
        <DMSidebar onOpenUserSettings={() => setIsUserSettingsOpen(true)} />
      )}

      {/* 3. Main Center Area */}
      <main className="flex flex-1 overflow-hidden relative">
        {currentServerId !== null ? (
          /* Server View */
          isViewingVoiceRoom ? (
            <VoiceRoom />
          ) : (
            <>
              <ChatArea onSelectUser={(u) => setSelectedProfileUser(u)} />
              <ThreadPanel />
              <MemberList onSelectUser={(u) => setSelectedProfileUser(u)} />
            </>
          )
        ) : (
          /* DM / Friends View */
          currentDMId ? (
            <DMChatArea onSelectUser={(u) => setSelectedProfileUser(u)} />
          ) : (
            <FriendsDashboard onSelectUser={(u) => setSelectedProfileUser(u)} />
          )
        )}
      </main>

      {/* Modals Layer */}
      <CreateServerModal />
      <JoinServerModal />
      <CreateChannelModal />
      <CreateCategoryModal />
      <InviteModal />
      <ServerSettingsModal />
      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        onClose={() => setIsUserSettingsOpen(false)}
      />
      <UserProfileModal
        user={selectedProfileUser}
        onClose={() => setSelectedProfileUser(null)}
      />
      <IncomingCallModal />
    </div>
  );
};

export default App;
