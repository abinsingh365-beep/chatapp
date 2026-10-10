import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate } from 'react-router-dom'
import { request, uploadImage, TOKEN_KEY, USER_KEY } from '../lib/api.js'
import { io } from 'socket.io-client'
import {
  ArrowUp,
  Ban,
  Check,
  ChevronLeft,
  LogOut,
  Mic,
  MicOff,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Phone,
  PhoneOff,
  Search,
  Send,
  Shield,
  Smile,
  UserRound,
  UserPlus,
  Users,
  Video,
  VideoOff,
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

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function conversationPreview(message) {
  if (!message) return 'Start a conversation'
  if (message.message_type === 'call') {
    return message.text || (message.call_type === 'video' ? 'Video call' : 'Voice call')
  }
  if (isAudioMessage(message)) return 'Voice message'
  return message.text || 'Attachment'
}

function isAudioMessage(message) {
  return message.message_type === 'audio' ||
    message.file_type?.startsWith('audio/') ||
    /\.(m4a|mp3|ogg|wav|webm)(?:$|[?#])/i.test(message.file_name || message.file_url || '')
}

const messageEmojis = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
  '😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘',
  '😋', '😎', '🤔', '😭', '😢', '😡', '🥳', '🤩',
  '👍', '👎', '👏', '🙌', '🙏', '❤️', '🔥', '🎉',
]

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showPeople, setShowPeople] = useState(false)
  const [profilePerson, setProfilePerson] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileEditing, setProfileEditing] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileUploadBusy, setProfileUploadBusy] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [recordingVoice, setRecordingVoice] = useState(false)
  const [voiceSecondsLeft, setVoiceSecondsLeft] = useState(60)
  const [call, setCall] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const messageScrollRef = useRef(null)
  const shouldScrollToBottomRef = useRef(true)
  const fileInputRef = useRef(null)
  const composeInputRef = useRef(null)
  const profileFileInputRef = useRef(null)
  const voiceRecorderRef = useRef(null)
  const voiceStreamRef = useRef(null)
  const voiceChunksRef = useRef([])
  const voiceTargetRef = useRef(null)
  const voiceSecondsLeftRef = useRef(60)
  const socketRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localVideoRef = useRef(null)
  const callRef = useRef(null)
  const pendingCandidatesRef = useRef([])

  const activeConversation = conversations.find((conversation) => conversation._id === activeId)
  const activePerson = getOtherParticipant(activeConversation, user?._id)

  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    const person = getOtherParticipant(conversation, user?._id)
    return person?.name?.toLowerCase().includes(search.toLowerCase())
  }), [conversations, search, user?._id])

  const visibleUsers = users.filter((person) => person.name.toLowerCase().includes(search.toLowerCase()))

  const isBlockedByMe = (person) => Boolean(person && (person.is_blocked_by_me || user?.blocked_users?.some((id) => (id._id || id) === person._id)))

  const updateCall = (nextCall) => {
    callRef.current = nextCall
    setCall(nextCall)
  }

  const cleanupCall = (failureMessage, failureStatus = 'failed') => {
    const currentCall = callRef.current
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    pendingCandidatesRef.current = []
    setMicrophoneEnabled(true)
    setCameraEnabled(true)
    updateCall(failureMessage && currentCall
      ? { ...currentCall, status: failureStatus, error: failureMessage }
      : null)
  }

  const flushPendingCandidates = async () => {
    const peerConnection = peerConnectionRef.current
    if (!peerConnection?.remoteDescription) return
    const candidates = pendingCandidatesRef.current.splice(0)
    for (const candidate of candidates) {
      await peerConnection.addIceCandidate(candidate)
    }
  }

  const createPeerConnection = (peerId, conversationId) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    peerConnectionRef.current = peerConnection
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('call:ice-candidate', {
          receiverId: peerId,
          conversationId,
          candidate: event.candidate,
        })
      }
    }
    peerConnection.ontrack = (event) => {
      setRemoteStream((current) => {
        const stream = current || new MediaStream()
        if (!stream.getTracks().some((track) => track.id === event.track.id)) {
          stream.addTrack(event.track)
        }
        return stream
      })
    }
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'failed') {
        cleanupCall('The call connection was lost.')
      }
    }
    localStreamRef.current?.getTracks().forEach((track) => peerConnection.addTrack(track, localStreamRef.current))
    return peerConnection
  }

  const getSocketUrl = () => {
    const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
    const isLoopback = (hostname) => ['localhost', '127.0.0.1', '::1'].includes(hostname)

    if (configuredSocketUrl) {
      const socketUrl = new URL(configuredSocketUrl, window.location.origin)
      if (!(isLoopback(socketUrl.hostname) && !isLoopback(window.location.hostname))) {
        return socketUrl.origin
      }
    }

    return new URL(apiUrl, window.location.origin).origin
  }

  useEffect(() => {
    if (!token) return undefined
    const socket = io(getSocketUrl(), { auth: { token } })
    socketRef.current = socket

    socket.on('connect_error', (err) => setError(err.message || 'Could not connect to calling service.'))
    socket.on('call:incoming', (incomingCall) => {
      if (callRef.current && !['failed', 'declined'].includes(callRef.current.status)) {
        socket.emit('call:decline', {
          receiverId: incomingCall.from.id,
          conversationId: incomingCall.conversationId,
        })
        return
      }
      if (callRef.current) cleanupCall()
      updateCall({
        status: 'incoming',
        peerId: incomingCall.from.id,
        peerName: incomingCall.from.name,
        conversationId: incomingCall.conversationId,
        callType: incomingCall.callType,
        offer: incomingCall.offer,
      })
    })
    socket.on('call:answered', async ({ answer, from }) => {
      if (callRef.current?.peerId !== from || !peerConnectionRef.current) return
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
        await flushPendingCandidates()
        updateCall({ ...callRef.current, status: 'active' })
      } catch (err) {
        cleanupCall()
        setError(`Could not connect the call: ${err.message}`)
      }
    })
    socket.on('call:ice-candidate', async ({ candidate, from }) => {
      if (callRef.current?.peerId !== from) return
      if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) {
        pendingCandidatesRef.current.push(candidate)
        return
      }
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        setError(`Could not connect the call: ${err.message}`)
      }
    })
    socket.on('call:ended', ({ from }) => {
      if (callRef.current?.peerId !== from) return
      cleanupCall()
      setSuccess('Call ended')
    })
    socket.on('call:declined', ({ from }) => {
      if (callRef.current?.peerId !== from) return
      cleanupCall('The other person declined the call.', 'declined')
    })
    socket.on('call:error', ({ message }) => {
      if (callRef.current) cleanupCall(message || 'The call could not be completed.')
      else setError(message || 'The call could not be completed.')
    })
      socket.on('call:log-created', async () => {
        try {
          const updatedConversations = await request('/chat/conversations', {}, token)
          setConversations(updatedConversations || [])
        } catch (err) {
          setError(err.message)
        }
      })

      return () => {
      socket.disconnect()
      socketRef.current = null
      cleanupCall()
    }
  }, [token])

  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream, remoteStream, call])

  useEffect(() => () => {
    const recorder = voiceRecorderRef.current
    if (recorder?.state === 'recording') {
      recorder.onstop = null
      recorder.stop()
    }
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!recordingVoice) return undefined
    const intervalId = setInterval(() => {
      const secondsLeft = Math.max(0, voiceSecondsLeftRef.current - 1)
      voiceSecondsLeftRef.current = secondsLeft
      setVoiceSecondsLeft(secondsLeft)
      if (secondsLeft === 0 && voiceRecorderRef.current?.state === 'recording') {
        voiceRecorderRef.current.stop()
      }
    }, 1000)
    return () => clearInterval(intervalId)
  }, [recordingVoice])

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
    if (!activeId || !token) {
      setMessages([])
      setLoading(false)
      return undefined
    }

    let isInitialLoad = true
    let cancelled = false
    shouldScrollToBottomRef.current = true
    setMessages([])
    setLoading(true)

    const fetchActiveMessages = async () => {
      try {
        const data = await request(`/message/${activeId}`, {}, token)
        if (cancelled) return
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
        if (cancelled) return
        setConversations(updatedConversations || [])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (isInitialLoad) {
          if (!cancelled) setLoading(false)
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

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [activeId, token])

  // Scroll after loading too, because the message list is hidden while loading.
  useEffect(() => {
    if (loading || !shouldScrollToBottomRef.current) return

    const messageScroll = messageScrollRef.current
    if (messageScroll) messageScroll.scrollTop = messageScroll.scrollHeight
  }, [messages, loading, activeId])

  const handleMessageScroll = (event) => {
    const element = event.currentTarget
    shouldScrollToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  const selectConversation = (conversation) => {
    shouldScrollToBottomRef.current = true
    setMessages([])
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

  const uploadVoiceNote = async (blob, target) => {
    if (blob.size > 8 * 1024 * 1024) {
      setError('Voice notes must be smaller than 8 MB. Please record a shorter note.')
      return
    }
    setUploadBusy(true)
    setSuccess('')
    try {
      const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const formData = new FormData()
      formData.append('conversationId', target.conversationId)
      formData.append('receiverId', target.receiverId)
      formData.append('image', blob, `voice-note-${Date.now()}.${extension}`)
      const message = await uploadImage('/message/send-image', formData, token)
      setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message])
      setSuccess('Voice message sent')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadBusy(false)
    }
  }

  const toggleVoiceRecording = async () => {
    if (voiceRecorderRef.current?.state === 'recording') {
      voiceRecorderRef.current.stop()
      return
    }
    if (!activePerson || !activeId) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      voiceStreamRef.current = stream
      voiceTargetRef.current = { conversationId: activeId, receiverId: activePerson._id }
      voiceChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) voiceChunksRef.current.push(event.data)
      }
      recorder.onerror = () => setError('Recording failed. Please try again.')
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        voiceStreamRef.current = null
        voiceRecorderRef.current = null
        setRecordingVoice(false)
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        voiceChunksRef.current = []
        if (blob.size) uploadVoiceNote(blob, voiceTargetRef.current)
      }
      voiceRecorderRef.current = recorder
      voiceSecondsLeftRef.current = 60
      setVoiceSecondsLeft(60)
      recorder.start()
      setRecordingVoice(true)
    } catch (err) {
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
      voiceStreamRef.current = null
      voiceRecorderRef.current = null
      setRecordingVoice(false)
      voiceSecondsLeftRef.current = 60
      setVoiceSecondsLeft(60)
      setError(err.name === 'NotAllowedError' ? 'Allow microphone access to record a voice message.' : `Could not start recording: ${err.message}`)
    }
  }

  const startCall = async (callType) => {
    if (!activePerson || !activeId) return
    if (callRef.current) return
    if (isBlockedByMe(activePerson)) {
      setError('Unblock this person before starting a call.')
      return
    }
    if (!socketRef.current?.connected) {
      setError('Calling service is unavailable. Please try again.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Calls require microphone permissions and a secure connection (HTTPS).')
      return
    }

    const attempt = {}
    const nextCall = {
      attempt,
      status: 'requesting',
      peerId: activePerson._id,
      peerName: activePerson.name,
      conversationId: activeId,
      callType,
    }
    updateCall(nextCall)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      })
      if (callRef.current !== nextCall) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      localStreamRef.current = stream
      setLocalStream(stream)
      updateCall({ ...nextCall, status: 'outgoing' })
      const peerConnection = createPeerConnection(activePerson._id, activeId)
      const offer = await peerConnection.createOffer()
      if (callRef.current?.attempt !== attempt) return
      await peerConnection.setLocalDescription(offer)
      socketRef.current.emit('call:offer', {
        receiverId: activePerson._id,
        conversationId: activeId,
        callType,
        offer: peerConnection.localDescription,
      })
    } catch (err) {
      cleanupCall(err.name === 'NotAllowedError'
        ? 'Allow microphone and camera access to make this call.'
        : `Could not start the call: ${err.message}`)
    }
  }

  const answerCall = async () => {
    const incomingCall = callRef.current
    if (!incomingCall || incomingCall.status !== 'incoming') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.callType === 'video',
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      const peerConnection = createPeerConnection(incomingCall.peerId, incomingCall.conversationId)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer))
      await flushPendingCandidates()
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      socketRef.current?.emit('call:answer', {
        receiverId: incomingCall.peerId,
        conversationId: incomingCall.conversationId,
        answer: peerConnection.localDescription,
      })
      updateCall({ ...incomingCall, status: 'active' })
    } catch (err) {
      cleanupCall(err.name === 'NotAllowedError'
        ? 'Allow microphone and camera access to answer.'
        : `Could not answer the call: ${err.message}`)
    }
  }

  const declineCall = () => {
    const currentCall = callRef.current
    if (currentCall) {
      socketRef.current?.emit('call:decline', {
        receiverId: currentCall.peerId,
        conversationId: currentCall.conversationId,
      })
    }
    cleanupCall()
  }

  const endCall = () => {
    const currentCall = callRef.current
    if (currentCall) {
      socketRef.current?.emit('call:end', {
        receiverId: currentCall.peerId,
        conversationId: currentCall.conversationId,
      })
    }
    cleanupCall()
    setSuccess('Call ended')
  }

  const retryCall = () => {
    if (!call || call.status !== 'failed' || activeId !== call.conversationId || activePerson?._id !== call.peerId) return
    const callType = call.callType
    cleanupCall()
    startCall(callType)
  }

  const toggleMicrophone = () => {
    const enabled = !microphoneEnabled
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled })
    setMicrophoneEnabled(enabled)
  }

  const toggleCamera = () => {
    const enabled = !cameraEnabled
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = enabled })
    setCameraEnabled(enabled)
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

  const insertEmoji = (emoji) => {
    const input = composeInputRef.current
    const cursorStart = input?.selectionStart ?? compose.length
    const cursorEnd = input?.selectionEnd ?? cursorStart
    const nextCompose = `${compose.slice(0, cursorStart)}${emoji}${compose.slice(cursorEnd)}`
    const nextCursor = cursorStart + emoji.length

    setCompose(nextCompose)
    setShowEmojiPicker(false)
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(nextCursor, nextCursor)
    })
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
                  <small>{conversationPreview(conversation.last_message)}</small>
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
              <div className="call-actions" aria-label="Call actions">
                <button className="icon-button" aria-label={`Voice call ${activePerson?.name}`} title="Voice call" disabled={Boolean(call)} onClick={() => startCall('audio')}>
                  <Phone size={18} />
                </button>
                <button className="icon-button" aria-label={`Video call ${activePerson?.name}`} title="Video call" disabled={Boolean(call)} onClick={() => startCall('video')}>
                  <Video size={18} />
                </button>
              </div>
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
                      <div className={`message-bubble ${message.message_type === 'image' ? 'image-bubble' : ''} ${isAudioMessage(message) ? 'audio-bubble' : ''}`}>
                        {message.message_type === 'call' ? (
                          <div className={`call-message ${message.call_status || ''}`}>
                            <span className="call-message-icon">
                              {message.call_type === 'video' ? <Video size={17} /> : <Phone size={17} />}
                            </span>
                            <span>{message.text || (message.call_type === 'video' ? 'Video call' : 'Voice call')}</span>
                          </div>
                        ) : message.message_type === 'image' ? (
                          <button className="image-preview-button" onClick={() => setPreviewImage(message.image)} aria-label="Preview image">
                            <img src={message.image} alt="Shared attachment" />
                          </button>
                        ) : isAudioMessage(message) ? (
                          <audio className="voice-player" controls playsInline preload="metadata" src={message.file_url}>
                            Your browser does not support audio playback.
                          </audio>
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
              {recordingVoice && (
                <div className="voice-recording-status" role="status" aria-live="off">
                  <span className="recording-indicator" />
                  Recording voice message
                  <strong>{formatDuration(voiceSecondsLeft)} left</strong>
                </div>
              )}
              <input ref={fileInputRef} className="file-input" type="file" accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={selectImage} />
              <button
                type="button"
                className="icon-button"
                aria-label="Send an image or file"
                title="Send an image or file"
                disabled={uploadBusy || recordingVoice}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={19} />
              </button>
              <button
                type="button"
                className={`icon-button voice-record-button ${recordingVoice ? 'recording' : ''}`}
                aria-label={recordingVoice ? 'Stop and send voice message' : 'Record a voice message'}
                title={recordingVoice ? 'Stop and send voice message' : 'Record a voice message'}
                disabled={uploadBusy}
                onClick={toggleVoiceRecording}
              >
                {recordingVoice ? <MicOff size={19} /> : <Mic size={19} />}
              </button>
              <div className="emoji-picker-wrap">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={showEmojiPicker ? 'Close emoji picker' : 'Open emoji picker'}
                  aria-expanded={showEmojiPicker}
                  title="Add emoji"
                  disabled={uploadBusy || recordingVoice}
                  onClick={() => setShowEmojiPicker((visible) => !visible)}
                >
                  <Smile size={19} />
                </button>
                {showEmojiPicker && (
                  <div className="emoji-picker" role="group" aria-label="Choose an emoji">
                    <p>Emojis</p>
                    <div className="emoji-grid">
                      {messageEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="emoji-option"
                          aria-label={`Insert ${emoji}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => insertEmoji(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={composeInputRef}
                value={compose}
                onChange={(event) => handleCompose(event.target.value)}
                placeholder={uploadBusy ? 'Uploading attachment...' : `Message ${activePerson?.name || ''}`}
                disabled={uploadBusy || recordingVoice}
              />
              <button className="send-button" aria-label="Send message" disabled={!compose.trim() || uploadBusy || recordingVoice}>
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

      {call && (
        createPortal(
          <div className="call-backdrop" role="dialog" aria-modal="true" aria-label={`${call.callType} call`}>
            <section className={`call-panel ${call.callType === 'video' ? 'video-call-panel' : ''}`}>
              <audio ref={remoteAudioRef} autoPlay />
              {call.callType === 'video' && (
                <>
                  <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
                  {localStream && <video ref={localVideoRef} className="local-video" autoPlay muted playsInline />}
                </>
              )}
              <div className="call-details">
                <Avatar person={activePerson?._id === call.peerId ? activePerson : { name: call.peerName }} size="profile-avatar" />
                <h2>{call.peerName}</h2>
                <p>
                  {call.status === 'incoming'
                    ? `Incoming ${call.callType} call`
                    : call.status === 'requesting'
                      ? 'Connecting microphone and camera...'
                      : call.status === 'outgoing'
                        ? `Calling ${call.peerName}...`
                        : call.status === 'failed' || call.status === 'declined'
                          ? call.status === 'declined' ? 'Call was declined' : 'Call could not connect'
                        : call.callType === 'video' ? 'Video call connected' : 'Voice call connected'}
                </p>
                {(call.status === 'failed' || call.status === 'declined') && <p className="call-error-message">{call.error}</p>}
              </div>
              <div className="call-controls">
                {call.status === 'incoming' ? (
                  <>
                    <button className="call-control decline" onClick={declineCall} aria-label="Decline call" title="Decline">
                      <PhoneOff size={19} />
                    </button>
                    <button className="call-control accept" onClick={answerCall} aria-label="Answer call" title="Answer">
                      {call.callType === 'video' ? <Video size={19} /> : <Phone size={19} />}
                    </button>
                  </>
                ) : call.status === 'failed' || call.status === 'declined' ? (
                  <>
                    {call.status === 'failed' && activeId === call.conversationId && activePerson?._id === call.peerId && (
                      <button className="call-control accept" onClick={retryCall} aria-label={`Retry ${call.callType} call`} title="Try again">
                        {call.callType === 'video' ? <Video size={19} /> : <Phone size={19} />}
                      </button>
                    )}
                    <button className="call-control decline" onClick={() => cleanupCall()} aria-label="Close call details" title="Close">
                      <X size={19} />
                    </button>
                  </>
                ) : (
                  <>
                    {call.status !== 'requesting' && (
                      <>
                        <button className={`call-control ${microphoneEnabled ? '' : 'muted'}`} onClick={toggleMicrophone} aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'} title={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}>
                          {microphoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
                        </button>
                        {call.callType === 'video' && (
                          <button className={`call-control ${cameraEnabled ? '' : 'muted'}`} onClick={toggleCamera} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'} title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>
                            {cameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
                          </button>
                        )}
                      </>
                    )}
                    <button className="call-control decline" onClick={endCall} aria-label="End call" title={call.status === 'requesting' ? 'Cancel call' : 'End call'}>
                      <PhoneOff size={19} />
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>,
          document.body,
        )
      )}

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