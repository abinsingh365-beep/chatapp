import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { request, uploadImage, TOKEN_KEY, USER_KEY } from '../lib/api.js'
import {
  ArrowUp,
  Ban,
  Check,
  ChevronLeft,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Shield,
  UserRound,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

function getOtherParticipant(conversation, userId) {
  return conversation?.participants?.find((person) => person._id !== userId) || conversation?.participants?.[0]
}

function initials(name = '') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CR'
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function Avatar({ person, size = '' }) {
  return (
    <div className={`avatar ${size}`} aria-label={person?.name || 'User'}>
      {person?.profile_image ? <img src={person.profile_image} alt="" /> : initials(person?.name)}
      {person?.is_online && <span className="online-dot" />}
    </div>
  )
}

function ChatPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem(USER_KEY) || 'null'))
  const [conversations, setConversations] = useState([])
  const [users, setUsers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [compose, setCompose] = useState('')
  const [showPeople, setShowPeople] = useState(false)
  const [profilePerson, setProfilePerson] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileUploadBusy, setProfileUploadBusy] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const messageScrollRef = useRef(null)
  const shouldScrollToBottomRef = useRef(true)
  const fileInputRef = useRef(null)
  const profileFileInputRef = useRef(null)

  const activeConversation = conversations.find((conversation) => conversation._id === activeId)
  const activePerson = getOtherParticipant(activeConversation, user?._id)

  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const person = getOtherParticipant(conversation, user?._id)
    return person?.name?.toLowerCase().includes(search.toLowerCase())
  }), [conversations, search, user?._id])

  const visibleUsers = users.filter((person) => person.name.toLowerCase().includes(search.toLowerCase()))

  const isBlockedByMe = (person) => Boolean(person && (person.is_blocked_by_me || user?.blocked_users?.some((id) => (id._id || id) === person._id)))

  useEffect(() => {
    if (!success) return undefined
    const timeoutId = setTimeout(() => setSuccess(''), 2500)
    return () => clearTimeout(timeoutId)
  }, [success])

  // Initial Data Fetching (Conversations, Users, Profile)
  useEffect(() => {
    if (!token) return undefined
    let mounted = true
    const peopleRequest = user?.user_type === 'ADMIN' ? request('/admin/users', {}, token) : request('/user/all', {}, token)

    Promise.all([request('/chat/conversations', {}, token), peopleRequest, request('/user/profile', {}, token)])
      .then(([conversationData, userData, profileData]) => {
        if (!mounted) return
        setConversations(conversationData || [])
        setUsers(userData || [])
        setUser(profileData)
        localStorage.setItem(USER_KEY, JSON.stringify(profileData))
        if (user?.user_type === 'ADMIN') setAdminUsers(userData || [])
      })
      .catch((err) => setError(err.message))

    return () => {
      mounted = false
    }
  }, [token, user?.user_type])

  // HTTP Polling for Messages & Conversations
  useEffect(() => {
    if (!activeId || !token) return undefined

    let isInitialLoad = true

    const fetchActiveMessages = async () => {
      if (isInitialLoad) setLoading(true)
      try {
        const data = await request(`/message/${activeId}`, {}, token)
        const nextMessages = data || []
        setMessages((current) => {
          if (
            current.length === nextMessages.length &&
            current.every((message, index) => message._id === nextMessages[index]._id)
          ) {
            return current
          }
          return nextMessages
        })
        
        // Also refresh conversation list in background to update last messages
        const updatedConversations = await request('/chat/conversations', {}, token)
        setConversations(updatedConversations || [])
      } catch (err) {
        setError(err.message)
      } finally {
        if (isInitialLoad) {
          setLoading(false)
          isInitialLoad = false
        }
      }
    }

    // Fetch immediately on conversation change
    fetchActiveMessages()

    // Mark messages as seen once when active conversation changes
    request(`/message/seen/${activeId}`, { method: 'PUT' }, token).catch(() => {})

    // Set up interval for short polling (every 3 seconds)
    const intervalId = setInterval(fetchActiveMessages, 3000)

    return () => clearInterval(intervalId)
  }, [activeId, token])

  // Stay at the bottom only when the user was already there.
  useEffect(() => {
    if (!shouldScrollToBottomRef.current) return

    const messageScroll = messageScrollRef.current
    if (messageScroll) messageScroll.scrollTop = messageScroll.scrollHeight
  }, [messages])

  const handleMessageScroll = (event) => {
    const element = event.currentTarget
    shouldScrollToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  const selectConversation = (conversation) => {
    shouldScrollToBottomRef.current = true
    setActiveId(conversation._id)
    setShowPeople(false)
    setSearch('')
  }

  const openProfile = (person) => {
    setProfilePerson(person)
    setProfileName(person?.name || '')
    setProfileEditing(false)
    setMenuOpen(false)
  }

  const startConversation = async (person) => {
    try {
      const conversation = await request('/chat/conversation', { method: 'POST', body: JSON.stringify({ receiverId: person._id }) }, token)
      setConversations((current) => current.some((item) => item._id === conversation._id) ? current : [conversation, ...current])
      selectConversation(conversation)
    } catch (err) {
      setError(err.message)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    const text = compose.trim()
    if (!text || !activePerson || !activeId) return
    setCompose('')
    setSuccess('')

    try {
      const message = await request('/message/send', { method: 'POST', body: JSON.stringify({ conversationId: activeId, receiverId: activePerson._id, text }) }, token)
      setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message])
      setSuccess('Message sent')
    } catch (err) {
      setSuccess('')
      setError(err.message)
      setCompose(text)
    }
  }

  const selectImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !activePerson || !activeId) return
    setUploadBusy(true)
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('conversationId', activeId)
      formData.append('receiverId', activePerson._id)
      formData.append('image', file)
      const message = await uploadImage('/message/send-image', formData, token)
      setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message])
      setSuccess('Attachment sent')
    } catch (err) {
      setSuccess('')
      setError(err.message)
    } finally {
      setUploadBusy(false)
    }
  }

  const handleCompose = (value) => {
    setCompose(value)
  }

  const logout = async () => {
    await request('/auth/logout', { method: 'POST' }, token).catch(() => {})
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    navigate('/')
  }

  const toggleBlock = async (person) => {
    if (!person || person._id === user?._id) return
    const blocked = isBlockedByMe(person)
    const action = blocked ? 'unblock' : 'block'

    try {
      await request(`/user/${action}/${person._id}`, { method: 'PUT' }, token)
      const update = (current) => current.map((item) => item._id === person._id ? { ...item, is_blocked_by_me: !blocked } : item)
      setUsers(update)
      setAdminUsers(update)
      setUser((current) => ({ ...current, blocked_users: blocked ? (current.blocked_users || []).filter((id) => (id._id || id) !== person._id) : [...(current.blocked_users || []), person._id] }))
      setProfilePerson((current) => current?._id === person._id ? { ...current, is_blocked_by_me: !blocked } : current)
    } catch (err) {
      setError(err.message)
    }
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    setProfileUploadBusy(true)

    try {
      const formData = new FormData()
      formData.append('name', profileName.trim())
      const file = profileFileInputRef.current?.files?.[0]
      if (file) formData.append('profileImage', file)
      const updatedUser = await uploadImage('/user/profile', formData, token, 'PUT')
      setUser(updatedUser)
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser))
      setProfilePerson(updatedUser)
      setProfileEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setProfileUploadBusy(false)
    }
  }

  if (!token || !user) return <Navigate to="/" replace />

  return (
    <main className="app-shell">
      <aside className={`sidebar ${activeId ? 'mobile-hidden' : ''}`}>
        <div className="sidebar-top">
          <div className="brand-mark small"><MessageCircle size={16} /></div>
          <span>Common Room</span>
          <button className="icon-button" aria-label="New conversation" onClick={() => setShowPeople(true)}>
            <UserPlus size={18} />
          </button>
        </div>

        <button className="profile-row profile-trigger" title="Open your profile" onClick={() => openProfile(user)}>
          <Avatar person={user} />
          <div>
            <strong>{user.name}</strong>
            <span className="status-label">{user.user_type === 'ADMIN' ? 'Administrator' : 'Available'}</span>
          </div>
          <UserRound size={16} />
        </button>

        <div className="search-box">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a conversation" />
        </div>

        <div className="section-label">
          <span>Conversations</span>
          <span>{visibleConversations.length}</span>
        </div>

        <div className="conversation-list">
          {visibleConversations.map((conversation) => {
            const person = getOtherParticipant(conversation, user._id)
            return (
              <button
                key={conversation._id}
                className={`conversation-item ${conversation._id === activeId ? 'selected' : ''}`}
                onClick={() => selectConversation(conversation)}
              >
                <Avatar person={person} />
                <span className="conversation-copy">
                  <strong>{person?.name}</strong>
                  <small>{conversation.last_message?.text || 'Start a conversation'}</small>
                </span>
                {conversation.last_message && <time>{formatTime(conversation.updatedAt)}</time>}
              </button>
            )
          })}
          {!visibleConversations.length && (
            <div className="empty-list">
              <Users size={20} />
              <p>Your conversations will appear here.</p>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="privacy-note">
            <Shield size={15} />
            <span>Conversations stay between you and your people.</span>
          </div>
          <button className="sidebar-logout" onClick={logout}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <section className={`chat-panel ${!activeId ? 'no-selection' : ''}`}>
        {activeConversation ? (
          <>
            <header className="chat-header">
              <button className="back-button" onClick={() => setActiveId(null)} aria-label="Back to conversations">
                <ChevronLeft size={20} />
              </button>
              <button className="profile-avatar-button" title="Open profile" onClick={() => openProfile(activePerson)}>
                <Avatar person={activePerson} />
              </button>
              <button className="chat-person profile-name-button" title="Open profile" onClick={() => openProfile(activePerson)}>
                <h2>{activePerson?.name}</h2>
                <span>{isBlockedByMe(activePerson) ? 'Blocked by you' : activePerson?.is_online ? 'Online now' : 'Offline'}</span>
              </button>
              <div className="chat-actions">
                <button className="icon-button header-action" aria-label="Conversation actions" title="Conversation actions" onClick={() => setMenuOpen((open) => !open)}>
                  <MoreHorizontal size={20} />
                </button>
                {menuOpen && (
                  <div className="chat-menu">
                    <button onClick={() => openProfile(activePerson)}>
                      <UserRound size={15} />
                      View profile
                    </button>
                    {activePerson && activePerson._id !== user._id && (
                      <button
                        className={isBlockedByMe(activePerson) ? 'unblock-menu-item' : 'block-menu-item'}
                        onClick={() => {
                          toggleBlock(activePerson)
                          setMenuOpen(false)
                        }}
                      >
                        <Ban size={15} />
                        {isBlockedByMe(activePerson) ? 'Unblock user' : 'Block user'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </header>

            <div ref={messageScrollRef} className="message-scroll" onScroll={handleMessageScroll}>
              <div className="day-divider"><span>Today</span></div>
              {loading ? (
                <div className="loading-state">Loading your messages...</div>
              ) : (
                messages.map((message) => {
                  const mine = message.sender?._id === user._id || message.sender === user._id
                  return (
                    <div className={`message-row ${mine ? 'mine' : ''}`} key={message._id}>
                      <div className={`message-bubble ${message.message_type === 'image' ? 'image-bubble' : ''}`}>
                        {message.message_type === 'image' ? (
                          <button className="image-preview-button" onClick={() => setPreviewImage(message.image)} aria-label="Preview image">
                            <img src={message.image} alt="Shared attachment" />
                          </button>
                        ) : message.message_type === 'file' ? (
                          <a className="file-attachment" href={message.file_url} target="_blank" rel="noreferrer">
                            <Paperclip size={16} />
                            <span>{message.file_name || 'Download attachment'}</span>
                          </a>
                        ) : (
                          <p>{message.text}</p>
                        )}
                        <div className="message-meta">
                          <time>{formatTime(message.createdAt)}</time>
                          {mine && <Check size={13} />}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input ref={fileInputRef} className="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={selectImage} />
              <button
                type="button"
                className="icon-button"
                aria-label="Send an image or file"
                title="Send an image or file"
                disabled={uploadBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={19} />
              </button>
              <input
                value={compose}
                onChange={(event) => handleCompose(event.target.value)}
                placeholder={uploadBusy ? 'Uploading attachment...' : `Message ${activePerson?.name || ''}`}
                disabled={uploadBusy}
              />
              <button className="send-button" aria-label="Send message" disabled={!compose.trim() || uploadBusy}>
                <Send size={17} />
              </button>
            </form>
          </>
        ) : (
          <div className="welcome-state">
            <div className="welcome-orbit"><MessageCircle size={31} /></div>
            <p className="eyebrow">Your people, in one place</p>
            <h1>Choose a conversation<br /><em>to begin.</em></h1>
            <p>Good conversations deserve somewhere to land.</p>
            <button className="primary-button compact" onClick={() => setShowPeople(true)}>
              <UserPlus size={16} /> Find someone
            </button>
          </div>
        )}
      </section>

      {showPeople && (
        <div className="modal-backdrop" onMouseDown={() => setShowPeople(false)}>
          <section className="people-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">People</p>
                <h2>Who are you thinking of?</h2>
              </div>
              <button className="icon-button" onClick={() => setShowPeople(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-search">
              <Search size={16} />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" />
            </div>
            <div className="people-list">
              {visibleUsers.map((person) => (
                <button className="person-item" key={person._id} onClick={() => startConversation(person)}>
                  <Avatar person={person} />
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.is_online ? 'Online now' : 'Available to chat'}</small>
                  </span>
                  <ArrowUp size={17} />
                </button>
              ))}
              {!visibleUsers.length && <p className="empty-modal">No people found yet.</p>}
            </div>
          </section>
        </div>
      )}

      {profilePerson && (
        <div className="modal-backdrop" onMouseDown={() => { setProfilePerson(null); setProfileEditing(false) }}>
          <section className="profile-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-button profile-close" onClick={() => setProfilePerson(null)} aria-label="Close">
              <X size={18} />
            </button>
            {profileEditing && profilePerson._id === user._id ? (
              <form className="profile-edit-form" onSubmit={saveProfile}>
                <button type="button" className="profile-avatar-edit" onClick={() => profileFileInputRef.current?.click()}>
                  <Avatar person={profilePerson} size="profile-avatar" />
                  <span>Change photo</span>
                </button>
                <input ref={profileFileInputRef} type="file" accept="image/*" className="file-input" />
                <label>
                  Name
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} required />
                </label>
                <button className="profile-action" disabled={profileUploadBusy}>
                  {profileUploadBusy ? 'Saving...' : 'Save profile'}
                </button>
                <button type="button" className="profile-secondary" onClick={() => setProfileEditing(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <button
                  className="profile-avatar-button modal-avatar-button"
                  onClick={() => profilePerson._id === user._id && setProfileEditing(true)}
                  title={profilePerson._id === user._id ? 'Edit profile' : 'Profile'}
                >
                  <Avatar person={profilePerson} size="profile-avatar" />
                </button>
                <p className="eyebrow">{profilePerson.user_type === 'ADMIN' ? 'Administrator' : 'Member'}</p>
                <h2>{profilePerson.name}</h2>
                <p className="profile-email">{profilePerson.email}</p>
                <p className={`profile-status ${isBlockedByMe(profilePerson) ? 'blocked' : ''}`}>
                  {isBlockedByMe(profilePerson) ? 'Blocked by you' : profilePerson.is_online ? 'Online now' : 'Offline'}
                </p>
                {profilePerson._id === user._id && (
                  <>
                    <button className="profile-action profile-edit-button" onClick={() => setProfileEditing(true)}>
                      <UserRound size={16} />Edit my profile
                    </button>
                    <button className="profile-secondary logout-button" onClick={logout}>
                      <LogOut size={16} />Sign out
                    </button>
                  </>
                )}
                {profilePerson._id !== user._id && (
                  <button className={`profile-action ${isBlockedByMe(profilePerson) ? 'unblock' : ''}`} onClick={() => toggleBlock(profilePerson)}>
                    <Ban size={16} />{isBlockedByMe(profilePerson) ? 'Unblock user' : 'Block user'}
                  </button>
                )}
                <button className="profile-secondary" onClick={() => setProfilePerson(null)}>
                  Close profile
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {previewImage && (
        <div className="image-preview-backdrop" onMouseDown={() => setPreviewImage(null)}>
          <section className="image-preview-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-button image-preview-close" onClick={() => setPreviewImage(null)} aria-label="Close image preview">
              <X size={20} />
            </button>
            <img src={previewImage} alt="Preview attachment" />
          </section>
        </div>
      )}

      {error && (
        <button className="toast" role="alert" onClick={() => setError('')}>
          {error}
          <X size={15} />
        </button>
      )}
      {!error && success && (
        <div className="toast toast-success" role="status" aria-live="polite">
          <Check size={15} />
          {success}
        </div>
      )}
    </main>
  )
}

export default ChatPage