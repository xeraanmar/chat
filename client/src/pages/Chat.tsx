import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { Send, Paperclip, Smile, Mic, ArrowLeft, Menu, Search, MoreVertical, Phone, Video, LogOut, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SearchModal from '../components/SearchModal';
import ProfileModal from '../components/ProfileModal';

interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: number;
  fromTelegram?: boolean;
}

interface ChatUser {
  id: string;
  name: string;
  avatarColor: string;
  lastMessage: string;
  time: string;
  unread?: number;
  online?: boolean;
  phoneNumber?: string;
}

export default function Chat() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [chatList, setChatList] = useState<ChatUser[]>([]);
  
  // Mobile Navigation State
  const [activeChat, setActiveChat] = useState<ChatUser | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();

  // Load User from LocalStorage
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      navigate('/');
      return;
    }
    setCurrentUser(JSON.parse(userStr));
  }, [navigate]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const newSocket = io('/', { path: '/socket.io' });
    setSocket(newSocket);

    newSocket.on('history', (history: Message[]) => setMessages(history));
    newSocket.on('message', (msg: Message) => setMessages((prev) => [...prev, msg]));

    return () => { newSocket.disconnect(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChat]);

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && socket && currentUser) {
      socket.emit('message', { 
        text: input, 
        senderId: currentUser.id,
        senderName: currentUser.firstName || currentUser.phoneNumber 
      });
      setInput("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  // Animation Variants
  const sidebarVariants = {
    hidden: { x: -300, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { x: -300, opacity: 0 }
  };

  const chatVariants = {
    hidden: { x: 300, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { duration: 0.3 } },
    exit: { x: 300, opacity: 0 }
  };

  // Fetch user chats
  useEffect(() => {
    if (!currentUser) return;

    const fetchChats = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/chats/user/${currentUser.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const chats = await res.json();
          const formattedChats = chats.map((chat: any) => {
            const otherUser = chat.participants.find((p: any) => p.id !== currentUser.id);
            return {
              id: chat.id,
              name: otherUser ? `${otherUser.firstName} ${otherUser.lastName || ''}` : 'Unknown',
              avatarColor: otherUser?.color || '#3b82f6',
              lastMessage: chat.messages[0]?.text || 'No messages yet',
              time: chat.updatedAt ? new Date(chat.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '',
              online: otherUser?.isOnline,
              type: 'private',
              otherUserId: otherUser?.id
            };
          });
          
          // Add General Chat
          setChatList([
            { 
              id: 'general', 
              name: "General Chat", 
              avatarColor: "#3b82f6", 
              lastMessage: messages.length > 0 ? messages[messages.length - 1].text : "Welcome!", 
              time: messages.length > 0 ? new Date(messages[messages.length - 1].timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "Now", 
              online: true,
              type: 'group'
            },
            ...formattedChats
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch chats:', error);
      }
    };

    fetchChats();
    const interval = setInterval(fetchChats, 5000); // Poll for updates
    return () => clearInterval(interval);
  }, [currentUser, messages]);

  const handleStartChat = async (user: any) => {
    setShowSearch(false);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/chats/private', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: currentUser.id,
          targetUserId: user.id
        })
      });
      
      if (res.ok) {
        const chat = await res.json();
        const otherUser = chat.participants.find((p: any) => p.id !== currentUser.id);
        const newChatUser = {
          id: chat.id,
          name: `${otherUser.firstName} ${otherUser.lastName || ''}`,
          avatarColor: otherUser.color || '#3b82f6',
          lastMessage: 'Start chatting...',
          time: 'Now',
          online: otherUser.isOnline,
          type: 'private',
          otherUserId: otherUser.id
        };
        setActiveChat(newChatUser);
        // Refresh chat list will happen automatically via polling
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const handleUpdateProfile = (updatedUser: any) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <div className="flex h-screen w-full bg-[#0e1621] overflow-hidden text-white font-sans">
      
      {/* Sidebar (Chat List) */}
      <AnimatePresence mode="wait">
        {(!isMobile || !activeChat) && (
          <motion.div 
            initial={isMobile ? "hidden" : false}
            animate="visible"
            exit="exit"
            variants={sidebarVariants}
            className={`flex flex-col bg-[#17212b] border-r border-black/20 ${isMobile ? 'w-full absolute inset-0 z-20' : 'w-80 md:w-96 relative'}`}
          >
            {/* Sidebar Header */}
            <div className="h-14 px-4 flex items-center justify-between bg-[#17212b] shadow-sm z-10">
              <div className="flex items-center gap-4">
                <Menu className="w-6 h-6 text-gray-400 cursor-pointer hover:text-white" />
                <h1 className="text-lg font-bold">Telegram</h1>
              </div>
              <div className="flex items-center gap-3">
                <Search onClick={() => setShowSearch(true)} className="w-6 h-6 text-gray-400 cursor-pointer hover:text-white" />
                <LogOut onClick={handleLogout} className="w-5 h-5 text-red-400 cursor-pointer hover:text-red-300" />
              </div>
            </div>

            {/* User Info */}
            {currentUser && (
              <div className="px-4 py-2 bg-[#202b36] mx-2 mt-2 rounded-lg flex items-center gap-3 group cursor-pointer" onClick={() => setShowProfile(true)}>
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-white"
                  style={{ backgroundColor: currentUser.color || '#3b82f6' }}
                >
                  {currentUser.firstName ? currentUser.firstName.charAt(0) : 'U'}
                </div>
                <div className="overflow-hidden flex-1">
                  <h3 className="font-bold text-sm truncate text-white">{currentUser.firstName} {currentUser.lastName}</h3>
                  <p className="text-xs text-gray-400 truncate">@{currentUser.username || currentUser.phoneNumber}</p>
                </div>
                <Edit2 className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar mt-2">
              {chatList.map((user) => (
                <div 
                  key={user.id} 
                  onClick={() => setActiveChat(user)}
                  className="flex items-center gap-3 p-3 mx-2 hover:bg-[#202b36] rounded-xl cursor-pointer transition-all group active:bg-[#2b5278]"
                >
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow-md relative text-white"
                    style={{ backgroundColor: user.avatarColor.startsWith('#') ? user.avatarColor : '#3b82f6' }}
                  >
                    {user.name.charAt(0)}
                    {user.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#17212b] rounded-full"></div>}
                  </div>
                  <div className="flex-1 min-w-0 border-b border-black/10 pb-3 group-hover:border-transparent">
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="font-medium text-white truncate">{user.name}</h4>
                      <span className={`text-xs ${user.unread ? 'text-blue-400 font-medium' : 'text-gray-500'}`}>{user.time}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-400 truncate group-hover:text-gray-300 max-w-[80%]">{user.lastMessage}</p>
                      {user.unread && (
                        <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                          {user.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SearchModal 
        isOpen={showSearch} 
        onClose={() => setShowSearch(false)} 
        onSelectUser={handleStartChat} 
      />
      
      <ProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        currentUser={currentUser}
        onUpdate={handleUpdateProfile}
      />

      {/* Main Chat Area */}
      <AnimatePresence mode="wait">
        {(!isMobile || activeChat) && (
          <motion.div 
            initial={isMobile ? "hidden" : false}
            animate="visible"
            exit="exit"
            variants={chatVariants}
            className={`flex-1 flex flex-col relative bg-[#0e1621] ${isMobile ? 'absolute inset-0 z-30' : ''}`}
          >
            {/* Chat Background Pattern */}
            <div className="absolute inset-0 bg-[url('https://web.telegram.org/img/bg_0.png')] opacity-10 bg-repeat z-0 pointer-events-none" />

            {/* Chat Header */}
            <div className="h-14 bg-[#17212b] flex items-center px-4 z-10 shadow-md justify-between shrink-0">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <button onClick={() => setActiveChat(null)} className="mr-1 p-1 -ml-2 rounded-full hover:bg-[#2b5278]">
                    <ArrowLeft className="w-6 h-6 text-gray-300" />
                  </button>
                )}
                <div 
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: activeChat?.avatarColor.startsWith('#') ? activeChat.avatarColor : '#3b82f6' }}
                >
                  {activeChat?.name.charAt(0) || 'G'}
                </div>
                <div className="flex flex-col justify-center">
                  <h3 className="font-bold text-white text-sm leading-tight">{activeChat?.name || 'General Chat'}</h3>
                  <p className="text-xs text-gray-400 leading-tight">{activeChat?.online ? 'online' : 'last seen recently'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-gray-400">
                <Phone className="w-5 h-5 cursor-pointer hover:text-white hidden sm:block" />
                <Video className="w-5 h-5 cursor-pointer hover:text-white hidden sm:block" />
                <Search className="w-5 h-5 cursor-pointer hover:text-white" />
                <MoreVertical className="w-5 h-5 cursor-pointer hover:text-white" />
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 z-10 space-y-1 custom-scrollbar">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50">
                  <div className="w-20 h-20 bg-[#182533] rounded-full flex items-center justify-center mb-4">
                    <Smile className="w-10 h-10" />
                  </div>
                  <p>No messages yet...</p>
                </div>
              )}
              
              {messages.map((msg, index) => {
                const isMe = currentUser && msg.senderId === currentUser.id;
                const isBot = msg.senderId === 'telegram-bot';
                const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);

                return (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} mb-1`}
                  >
                    {!isMe && showAvatar && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0 mr-2 self-end mb-1 flex items-center justify-center text-xs font-bold">
                        {isBot ? 'B' : 'U'}
                      </div>
                    )}
                    {!isMe && !showAvatar && <div className="w-10" />} {/* Spacer */}

                    <div className={`max-w-[85%] sm:max-w-[70%] px-3 py-1.5 rounded-2xl shadow-sm relative text-[15px] ${
                      isMe 
                        ? 'bg-[#2b5278] text-white rounded-tr-sm' 
                        : 'bg-[#182533] text-white rounded-tl-sm'
                    }`}>
                      {isBot && <p className="text-xs text-blue-400 font-bold mb-0.5">Telegram Bot</p>}
                      <p className="leading-snug break-words whitespace-pre-wrap">{msg.text}</p>
                      <div className={`text-[10px] text-right mt-0.5 select-none ${isMe ? 'text-blue-200' : 'text-gray-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {isMe && <span className="ml-1">✓✓</span>}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-2 sm:p-3 bg-[#17212b] z-10 shrink-0">
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex items-end gap-2">
                 <button type="button" className="p-3 text-gray-400 hover:text-gray-300 transition-colors hidden sm:block">
                   <Paperclip className="w-6 h-6" />
                 </button>
                 
                 <div className="flex-1 bg-[#0e1621] rounded-2xl flex items-center px-3 py-2 min-h-[44px] sm:min-h-[48px]">
                   <button type="button" className="mr-2 text-gray-400 hover:text-gray-300">
                     <Smile className="w-6 h-6" />
                   </button>
                   <input 
                     type="text" 
                     value={input}
                     onChange={(e) => setInput(e.target.value)}
                     placeholder="Message" 
                     className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-[15px]"
                   />
                   <button type="button" className="ml-2 text-gray-400 hover:text-gray-300 sm:hidden">
                     <Paperclip className="w-5 h-5" />
                   </button>
                 </div>

                 {input.trim() ? (
                   <motion.button 
                     initial={{ scale: 0 }}
                     animate={{ scale: 1 }}
                     type="submit" 
                     className="p-3 bg-[#3390ec] rounded-full text-white shadow-lg hover:bg-[#2b7ac9] transition-colors"
                   >
                     <Send className="w-5 h-5 ml-0.5" />
                   </motion.button>
                 ) : (
                   <button type="button" className="p-3 bg-[#17212b] rounded-full text-gray-400 hover:bg-[#232e3c] transition-colors">
                     <Mic className="w-6 h-6" />
                   </button>
                 )}
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
