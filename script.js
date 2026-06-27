import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onChildChanged, onValue, off, get, update, remove, set } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

// ==========================================
// CẤU HÌNH API GEMINI & FIREBASE
// ==========================================
const part1 = 'AQ.Ab8RN6KpBz7AoX';
const part2 = 'EpRenyi6U63TKnqdFvEO';
const part3 = '3_7WGbVb2kUI2SJQ'; // Lấy từ https://aistudio.google.com
const GEMINI_API_KEY = `${part1}${part2}${part3}`;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const firebaseConfig = {
    apiKey: "AIzaSyBWvxVVnoOEoK7DlkvH4GMy2TZ5UyItn5A",
    authDomain: "chatbotairooms.firebaseapp.com",
    databaseURL: "https://chatbotairooms-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "chatbotairooms",
    storageBucket: "chatbotairooms.firebasestorage.app",
    messagingSenderId: "234528451358",
    appId: "1:234528451358:web:25c0057f6d6b6545a4770f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ==========================================
// BIẾN TOÀN CỤC
// ==========================================
let currentUser = null;
let currentMode = 'private'; 
let currentRoomId = null;
let currentRoomData = null; 
let currentChatListener = null; 
let currentChatEditListener = null;
let currentReplyData = null;

let userAvatarStr = localStorage.getItem('userAvatar') || null;
let botAvatarStr = localStorage.getItem('botAvatar') || null;

// Cấu hình lệnh hệ thống và lịch sử lưu trữ cho Gemini
const systemInstruction = "Từ giờ bạn là một chuyên gia AI về SQL. Hãy giúp tôi giải bài tập, viết câu truy vấn và sửa lỗi SQL.";
let sessionHistory = [];

/* ==========================================
    LOGIC GIAO DIỆN MENU MOBILE
========================================== */
const mainSidebar = document.getElementById('main-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const btnOpenSidebar = document.getElementById('btn-open-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');

window.openSidebarMobile = function() {
    if(mainSidebar) mainSidebar.classList.remove('-translate-x-full');
    if(sidebarOverlay) sidebarOverlay.classList.remove('hidden');
}
window.closeSidebarMobile = function() {
    if(mainSidebar) mainSidebar.classList.add('-translate-x-full');
    if(sidebarOverlay) sidebarOverlay.classList.add('hidden');
}
if (btnOpenSidebar) btnOpenSidebar.addEventListener('click', openSidebarMobile);
if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebarMobile);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebarMobile);

/* ==========================================
    QUẢN LÝ TÀI KHOẢN & KHỞI ĐỘNG
========================================== */
const authBtn = document.getElementById('auth-action-btn');
const authBtnText = document.getElementById('auth-btn-text');
const authGearIcon = document.getElementById('auth-gear-icon');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userRef = ref(db, `users/${user.uid}`);
        const userSnap = await get(userRef);
        if (userSnap.exists() && userSnap.val().avatar) {
            userAvatarStr = userSnap.val().avatar;
            localStorage.setItem('userAvatar', userAvatarStr);
        }

        const displayName = user.displayName || user.email;
        if(document.getElementById('user-email-display')) document.getElementById('user-email-display').innerText = "Tài khoản: " + displayName;
        if(authBtnText) authBtnText.innerText = "Tài khoản";
        if(authGearIcon) authGearIcon.classList.remove('hidden');
        await checkInviteLink();
    } else {
        currentUser = null;
        if(document.getElementById('user-email-display')) document.getElementById('user-email-display').innerText = "Trạng thái: Khách (Chưa đăng nhập)";
        if(authBtnText) authBtnText.innerText = "Đăng nhập";
        if(authGearIcon) authGearIcon.classList.add('hidden'); 
    }
    
    if(document.getElementById('room-list')) {
        loadRooms(); 
        if(!currentRoomId) openPrivateChat(); 
    }
});

if(authBtn) {
    authBtn.addEventListener('click', () => {
        if (!currentUser) window.location.href = 'auth.html'; 
        else {
            document.getElementById('settings-modal').classList.remove('hidden');
            document.getElementById('settings-name-input').value = currentUser.displayName || '';
            tempSettingsAvatar = userAvatarStr;
            updateSettingsPreview();
        }
    });
}

/* ==========================================
    LINK MỜI THAM GIA NHÓM
========================================== */
async function checkInviteLink() {
    if(!document.getElementById('invite-link-modal')) return;
    const urlParams = new URLSearchParams(window.location.search);
    const inviteRoomId = urlParams.get('join');
    if (!inviteRoomId || !currentUser) return;

    const snapshot = await get(ref(db, `rooms/${inviteRoomId}`));
    if (!snapshot.exists()) {
        alert("Nhóm không tồn tại hoặc đã bị xóa!");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    const rData = snapshot.val();
    if (rData.members && rData.members[currentUser.uid]) {
        executeJoinRoom(inviteRoomId, rData);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    document.getElementById('invite-link-modal').classList.remove('hidden');
    document.getElementById('invite-link-modal').children[0].classList.replace('scale-95', 'scale-100');
    document.getElementById('invite-room-name').innerText = rData.name;
    document.getElementById('invite-avatar').innerHTML = rData.avatar ? `<img src="${rData.avatar}" class="w-full h-full object-cover">` : `<span class="text-4xl text-slate-400 font-bold">#</span>`;

    const pwdArea = document.getElementById('invite-password-area');
    if (rData.type === 'private') pwdArea.classList.remove('hidden');
    else pwdArea.classList.add('hidden');

    document.getElementById('btn-accept-invite').onclick = async () => {
        if (rData.type === 'private') {
            const pwd = document.getElementById('invite-password').value;
            if (pwd !== rData.password) return alert("Mật khẩu nhóm không đúng!");
        }
        const myName = currentUser.displayName || currentUser.email;
        await set(ref(db, `rooms/${inviteRoomId}/members/${currentUser.uid}`), { name: myName, avatar: userAvatarStr, role: 'member' });
        push(ref(db, `group_messages/${inviteRoomId}`), { sender: 'system', text: `${myName} đã tham gia nhóm.`, timestamp: Date.now(), type: 'text' });
        document.getElementById('invite-link-modal').classList.add('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
        executeJoinRoom(inviteRoomId, rData);
    };

    document.getElementById('btn-decline-invite').onclick = () => {
        document.getElementById('invite-link-modal').classList.add('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
    };
}

/* ==========================================
    CÀI ĐẶT NGƯỜI DÙNG
========================================== */
let tempSettingsAvatar = userAvatarStr;
function updateSettingsPreview() {
    const previewBox = document.getElementById('settings-avatar-preview');
    if(!previewBox) return;
    if (tempSettingsAvatar) previewBox.innerHTML = `<img src="${tempSettingsAvatar}" class="w-full h-full object-cover">`;
    else previewBox.innerHTML = `<span class="text-slate-500 text-3xl font-bold">${(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}</span>`;
}

const closeSettingsBtn = document.getElementById('close-settings-modal');
if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => { document.getElementById('settings-modal').classList.add('hidden'); });

const settingsAvatarUpload = document.getElementById('settings-avatar-upload');
if(settingsAvatarUpload) {
    settingsAvatarUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                tempSettingsAvatar = event.target.result;
                updateSettingsPreview();
            };
            reader.readAsDataURL(file);
        }
    });
}

const saveSettingsBtn = document.getElementById('save-settings-btn');
if(saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const newName = document.getElementById('settings-name-input').value.trim();
        if (!newName) return alert("Tên không được để trống!");
        if (tempSettingsAvatar) {
            userAvatarStr = tempSettingsAvatar;
            localStorage.setItem('userAvatar', tempSettingsAvatar);
        }
        document.getElementById('save-settings-btn').innerText = "Đang lưu...";
        try {
            await updateProfile(currentUser, { displayName: newName });
            await set(ref(db, `users/${currentUser.uid}`), { name: newName, avatar: userAvatarStr });
            document.getElementById('save-settings-btn').innerText = "Lưu Thay Đổi";
            document.getElementById('user-email-display').innerText = "Tài khoản: " + newName;
            document.getElementById('settings-modal').classList.add('hidden');
            if (currentMode === 'group' && currentRoomId) update(ref(db, `rooms/${currentRoomId}/members/${currentUser.uid}`), { name: newName, avatar: userAvatarStr });
            alert("Cập nhật thông tin thành công!");
        } catch (error) {
            alert("Lỗi: " + error.message);
            document.getElementById('save-settings-btn').innerText = "Lưu Thay Đổi";
        }
    });
}

const logoutBtn = document.getElementById('logout-settings-btn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
            signOut(auth).then(() => {
                document.getElementById('settings-modal').classList.add('hidden');
                window.location.reload();
            });
        }
    });
}

/* ==========================================
    TẠO VÀ HIỂN THỊ NHÓM
========================================== */
let roomType = 'public';
let roomAvatarBase64 = null;

const btnOpenCreate = document.getElementById('btn-open-create-room');
if(btnOpenCreate) {
    btnOpenCreate.addEventListener('click', () => {
        if (!currentUser) return alert("Bạn phải Đăng nhập để tạo nhóm chat!");
        document.getElementById('create-room-modal').classList.remove('hidden');
    });
}

const closeCreateRoom = document.getElementById('close-create-room');
if(closeCreateRoom) closeCreateRoom.addEventListener('click', () => document.getElementById('create-room-modal').classList.add('hidden'));

const btnPublic = document.getElementById('btn-public');
if(btnPublic) {
    btnPublic.addEventListener('click', () => {
        roomType = 'public';
        document.getElementById('btn-public').className = "flex-1 py-2 rounded-lg font-medium border-2 border-blue-600 bg-blue-50 text-blue-600 transition text-sm md:text-base";
        document.getElementById('btn-private').className = "flex-1 py-2 rounded-lg font-medium border-2 border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 text-sm md:text-base";
        document.getElementById('room-password-container').classList.add('hidden');
    });
}

const btnPrivate = document.getElementById('btn-private');
if(btnPrivate) {
    btnPrivate.addEventListener('click', () => {
        roomType = 'private';
        document.getElementById('btn-private').className = "flex-1 py-2 rounded-lg font-medium border-2 border-blue-600 bg-blue-50 text-blue-600 transition text-sm md:text-base";
        document.getElementById('btn-public').className = "flex-1 py-2 rounded-lg font-medium border-2 border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 text-sm md:text-base";
        document.getElementById('room-password-container').classList.remove('hidden');
    });
}

const roomAvatarUpload = document.getElementById('room-avatar-upload');
if(roomAvatarUpload) {
    roomAvatarUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                roomAvatarBase64 = event.target.result;
                document.getElementById('room-avatar-preview').innerHTML = `<img src="${roomAvatarBase64}" class="w-full h-full object-cover">`;
            };
            reader.readAsDataURL(file);
        }
    });
}

const confirmCreateRoom = document.getElementById('confirm-create-room');
if(confirmCreateRoom) {
    confirmCreateRoom.addEventListener('click', async () => {
        const name = document.getElementById('room-name-input').value.trim();
        const password = document.getElementById('room-password-input').value;
        if (!name) return alert("Vui lòng nhập tên nhóm!");
        if (roomType === 'private' && !password) return alert("Vui lòng nhập mật khẩu cho nhóm bảo mật!");

        const myName = currentUser.displayName || currentUser.email;
        const newRoomRef = push(ref(db, 'rooms'));
        await set(newRoomRef, { 
            name: name, type: roomType, password: roomType === 'private' ? password : "", avatar: roomAvatarBase64, timestamp: Date.now(), creatorId: currentUser.uid,
            members: { [currentUser.uid]: { name: myName, avatar: userAvatarStr, role: 'creator' } }
        });

        push(ref(db, `group_messages/${newRoomRef.key}`), { sender: 'system', text: `${myName} đã tạo nhóm.`, timestamp: Date.now(), type: 'text' });
        
        document.getElementById('create-room-modal').classList.add('hidden');
        document.getElementById('room-name-input').value = "";
        document.getElementById('room-password-input').value = "";
        document.getElementById('room-avatar-preview').innerHTML = `<span class="text-slate-500 text-sm">Ảnh</span>`;
        roomAvatarBase64 = null;
        alert("Tạo nhóm thành công!");
    });
}

function loadRooms() {
    const roomListDiv = document.getElementById('room-list');
    if(!roomListDiv) return;

    onValue(ref(db, 'rooms'), (snapshot) => {
        roomListDiv.innerHTML = '<p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Cộng đồng (Nhóm chung)</p>';
        snapshot.forEach((childSnapshot) => {
            const room = childSnapshot.val();
            const roomId = childSnapshot.key;
            
            const btn = document.createElement('div');
            btn.className = "group flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 cursor-pointer transition-all border border-transparent";
            let avatarHtml = room.avatar ? `<img src="${room.avatar}" class="w-full h-full object-cover">` : `#`;
            let lockIcon = room.type === 'private' ? `<span class="text-xs text-slate-400">🔒</span>` : '';

            btn.innerHTML = `
                <div class="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300 font-bold overflow-hidden">${avatarHtml}</div>
                <h3 class="font-medium text-sm text-slate-300 group-hover:text-white flex-1 truncate">${room.name}</h3>
                <div class="flex items-center gap-2 ml-auto">
                    ${lockIcon}
                    <button class="hidden group-hover:flex w-6 h-6 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded items-center justify-center transition-colors text-xs btn-delete-room-super" title="Xóa nhóm cấp cao">✖</button>
                </div>
            `;
            
            btn.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-room-super')) return;
                handleJoinRoomReq(roomId, room);
            });

            const deleteBtn = btn.querySelector('.btn-delete-room-super');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const pass = prompt("🔐 YÊU CẦU QUYỀN TỐI CAO:\nNhập mật khẩu cấp cao nhất để xóa nhóm:");
                if (pass === "10101010") {
                    if (confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN nhóm "${room.name}" không?`)) {
                        remove(ref(db, `rooms/${roomId}`));
                        remove(ref(db, `group_messages/${roomId}`));
                        alert("✅ Đã xóa nhóm thành công!");
                        if (currentRoomId === roomId) openPrivateChat();
                    }
                } else if (pass !== null) alert("❌ Mật khẩu cấp cao không chính xác!");
            });

            roomListDiv.appendChild(btn);
        });
    });
}

/* ==========================================
    VÀO NHÓM VÀ TÙY CHỌN NHÓM
========================================== */
const btnPrivateChat = document.getElementById('btn-private-chat');
if (btnPrivateChat) btnPrivateChat.addEventListener('click', openPrivateChat);

let pendingRoomId = null;
let pendingRoomData = null;

window.handleJoinRoomReq = function(roomId, roomData) {
    if (!currentUser) return alert("Bạn cần Đăng nhập để vào nhóm!");
    const isMember = roomData.members && roomData.members[currentUser.uid];

    if (isMember || roomData.type === 'public') {
        if (!isMember) {
            const myName = currentUser.displayName || currentUser.email;
            set(ref(db, `rooms/${roomId}/members/${currentUser.uid}`), { name: myName, avatar: userAvatarStr, role: 'member' });
            push(ref(db, `group_messages/${roomId}`), { sender: 'system', text: `${myName} đã tham gia nhóm.`, timestamp: Date.now(), type: 'text' });
        }
        executeJoinRoom(roomId, roomData);
    } else {
        pendingRoomId = roomId;
        pendingRoomData = roomData;
        document.getElementById('join-password').value = "";
        document.getElementById('join-room-modal').classList.remove('hidden');
    }
}

const cancelJoinRoom = document.getElementById('cancel-join-room');
if(cancelJoinRoom) cancelJoinRoom.addEventListener('click', () => { document.getElementById('join-room-modal').classList.add('hidden'); });

const confirmJoinRoom = document.getElementById('confirm-join-room');
if(confirmJoinRoom) {
    confirmJoinRoom.addEventListener('click', async () => {
        const pass = document.getElementById('join-password').value;
        if (pass !== pendingRoomData.password) return alert("Mật khẩu nhóm không đúng!");
        
        const myName = currentUser.displayName || currentUser.email;
        await set(ref(db, `rooms/${pendingRoomId}/members/${currentUser.uid}`), { name: myName, avatar: userAvatarStr, role: 'member' });
        push(ref(db, `group_messages/${pendingRoomId}`), { sender: 'system', text: `${myName} đã tham gia nhóm.`, timestamp: Date.now(), type: 'text' });

        document.getElementById('join-room-modal').classList.add('hidden');
        executeJoinRoom(pendingRoomId, pendingRoomData);
    });
}

let roomListener = null;

function executeJoinRoom(roomId, roomData) {
    currentMode = 'group';
    currentRoomId = roomId;
    currentRoomData = roomData;

    document.getElementById('btn-private-chat').classList.replace('bg-blue-600', 'bg-slate-800');
    document.getElementById('btn-group-options').classList.remove('hidden'); 

    document.getElementById('room-title').innerHTML = `<span id="room-icon">🌍</span> Nhóm: <span id="header-room-name">${roomData.name}</span>`;
    document.getElementById('user-input').placeholder = "Nhắn với nhóm (@bot để gọi AI)...";

    if (roomListener) off(roomListener);
    roomListener = ref(db, `rooms/${roomId}`);
    onValue(roomListener, (snap) => {
        if (snap.exists()) {
            currentRoomData = snap.val();
            if (!currentRoomData.members || !currentRoomData.members[currentUser.uid]) {
                alert("Bạn đã rời khỏi (hoặc bị kick khỏi) nhóm này!");
                openPrivateChat();
                return;
            }
            document.getElementById('header-room-name').innerText = currentRoomData.name;
            renderDrawerData();
        } else {
            alert("Nhóm đã bị giải tán!");
            openPrivateChat();
        }
    });

    if (currentChatListener) off(currentChatListener);
    if (currentChatEditListener) off(currentChatEditListener);
    document.getElementById('chat-box').innerHTML = '';

    const chatRef = ref(db, `group_messages/${roomId}`);
    currentChatListener = chatRef;
    currentChatEditListener = chatRef;

    onChildAdded(chatRef, (snapshot) => renderMessage(snapshot.key, snapshot.val()));
    onChildChanged(chatRef, (snapshot) => renderMessage(snapshot.key, snapshot.val()));

    window.closeSidebarMobile();
}

function openPrivateChat() {
    currentMode = 'private';
    currentRoomId = null;
    currentRoomData = null;

    if (roomListener) off(roomListener);
    closeGroupDrawer();
    document.getElementById('btn-group-options').classList.add('hidden');

    document.getElementById('btn-private-chat').classList.replace('bg-slate-800', 'bg-blue-600');
    document.getElementById('room-title').innerHTML = `<span id="room-icon">🤖</span> Hỏi Đáp Riêng Tư`;
    document.getElementById('user-input').placeholder = "Hỏi AI bài tập SQL...";

    if (currentChatListener) off(currentChatListener);
    if (currentChatEditListener) off(currentChatEditListener);
    document.getElementById('chat-box').innerHTML = ''; 
    
    // Khởi tạo lịch sử rỗng theo chuẩn Gemini
    sessionHistory = [];

    if (currentUser) {
        const chatRef = ref(db, `private_messages/${currentUser.uid}`);
        currentChatListener = chatRef;
        currentChatEditListener = chatRef;

        onChildAdded(chatRef, (snapshot) => {
            const msg = snapshot.val();
            renderMessage(snapshot.key, msg);
            
            // Đồng bộ lịch sử tin nhắn dạng 'user' và 'model' phù hợp cấu trúc Gemini
            if (msg.type === 'text' && msg.text !== "Tin nhắn đã được thu hồi") {
                sessionHistory.push({ 
                    role: msg.sender === 'ai' ? "model" : "user", 
                    parts: [{ text: msg.text }] 
                });
            }
        });
        onChildChanged(chatRef, (snapshot) => renderMessage(snapshot.key, snapshot.val()));
    } else {
        renderMessage('sys_guest', { sender: 'system', text: 'Chào bạn! Đăng nhập để AI có thể lưu lại lịch sử và dùng đầy đủ tính năng nhé!' });
    }

    window.closeSidebarMobile();
}

/* ==========================================
    DRAWER TÙY CHỌN NHÓM & QUẢN LÝ THÀNH VIÊN
========================================== */
const drawer = document.getElementById('group-drawer');
const btnGroupOpts = document.getElementById('btn-group-options');
if(btnGroupOpts) {
    btnGroupOpts.addEventListener('click', () => {
        drawer.classList.remove('translate-x-full');
        renderDrawerData();
    });
}
const closeDrawerBtn = document.getElementById('close-drawer-btn');
if(closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeGroupDrawer);

function closeGroupDrawer() { if(drawer) drawer.classList.add('translate-x-full'); }

function renderDrawerData() {
    if (!currentRoomData || !currentRoomData.members) return;
    const myRole = currentRoomData.members[currentUser.uid]?.role || 'member';
    const isCreator = myRole === 'creator';
    const isAdmin = myRole === 'admin' || isCreator;

    const avatarBox = document.getElementById('drawer-group-avatar');
    avatarBox.innerHTML = currentRoomData.avatar ? `<img src="${currentRoomData.avatar}" class="w-full h-full object-cover">` : `<span class="text-slate-400 font-bold text-xl">#</span>`;
    
    const nameInput = document.getElementById('drawer-group-name');
    nameInput.value = currentRoomData.name;
    const btnSaveName = document.getElementById('btn-save-group-name');
    
    if (isAdmin) {
        document.getElementById('edit-avatar-overlay').classList.remove('hidden');
        document.getElementById('edit-group-avatar').disabled = false;
        nameInput.readOnly = false;
        nameInput.oninput = () => btnSaveName.classList.remove('hidden');
    } else {
        document.getElementById('edit-avatar-overlay').classList.add('hidden');
        document.getElementById('edit-group-avatar').disabled = true;
        nameInput.readOnly = true;
        btnSaveName.classList.add('hidden');
    }

    document.getElementById('drawer-admin-actions').classList.remove('hidden');
    if (isCreator) {
        document.getElementById('btn-delete-group').classList.remove('hidden');
        document.getElementById('btn-leave-group').classList.add('hidden');
    } else {
        document.getElementById('btn-delete-group').classList.add('hidden');
        document.getElementById('btn-leave-group').classList.remove('hidden');
    }

    const membersArr = Object.entries(currentRoomData.members);
    document.getElementById('member-count').innerText = membersArr.length;
    const listDiv = document.getElementById('drawer-member-list');
    listDiv.innerHTML = '';

    membersArr.forEach(([uid, mData]) => {
        const isMe = uid === currentUser.uid;
        let roleBadge = '';
        if (mData.role === 'creator') roleBadge = `<span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200">Người tạo</span>`;
        else if (mData.role === 'admin') roleBadge = `<span class="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded border border-blue-200">Quản trị</span>`;

        let actionsHtml = '';
        if (!isMe && isAdmin) { 
            if (mData.role !== 'creator' && !(myRole === 'admin' && mData.role === 'admin')) {
                let promoteBtn = isCreator && mData.role === 'member' ? `<button onclick="promoteAdmin('${uid}')" class="text-[10px] md:text-xs text-blue-600 hover:underline">Thăng cấp</button>` : '';
                let kickBtn = `<button onclick="kickMember('${uid}', '${mData.name}')" class="text-[10px] md:text-xs text-red-600 hover:underline">Kick</button>`;
                actionsHtml = `<div class="flex gap-2 ml-2">${promoteBtn}${kickBtn}</div>`;
            }
        }

        const avatarH = mData.avatar ? `<img src="${mData.avatar}" class="w-full h-full object-cover">` : `<span class="text-xs">${mData.name.charAt(0)}</span>`;
        
        listDiv.innerHTML += `
            <div class="flex items-center justify-between p-2 hover:bg-slate-100 rounded-lg group">
                <div class="flex items-center gap-2 overflow-hidden">
                    <div class="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center font-bold overflow-hidden flex-shrink-0">${avatarH}</div>
                    <div class="flex flex-col overflow-hidden">
                        <span class="text-xs md:text-sm font-medium text-slate-700 truncate">${mData.name} ${isMe ? '(Bạn)' : ''}</span>
                        ${roleBadge}
                    </div>
                </div>
                ${actionsHtml}
            </div>
        `;
    });
}

const editGroupAvatar = document.getElementById('edit-group-avatar');
if(editGroupAvatar) {
    editGroupAvatar.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) { update(ref(db, `rooms/${currentRoomId}`), { avatar: event.target.result }); };
            reader.readAsDataURL(file);
        }
    });
}
const btnSaveGroupName = document.getElementById('btn-save-group-name');
if(btnSaveGroupName) {
    btnSaveGroupName.addEventListener('click', () => {
        const newName = document.getElementById('drawer-group-name').value.trim();
        if (newName) {
            update(ref(db, `rooms/${currentRoomId}`), { name: newName });
            document.getElementById('btn-save-group-name').classList.add('hidden');
        }
    });
}
const btnCopyLink = document.getElementById('btn-copy-link');
if(btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
        const inviteLink = window.location.origin + window.location.pathname + '?join=' + currentRoomId;
        navigator.clipboard.writeText(inviteLink).then(() => alert("Đã copy link mời! Hãy gửi cho bạn bè nhé."));
    });
}
const btnDeleteGroup = document.getElementById('btn-delete-group');
if(btnDeleteGroup) {
    btnDeleteGroup.addEventListener('click', () => {
        if(confirm("Bạn có chắc chắn muốn giải tán nhóm này vĩnh viễn?")) {
            remove(ref(db, `rooms/${currentRoomId}`));
            remove(ref(db, `group_messages/${currentRoomId}`));
        }
    });
}
const btnLeaveGroup = document.getElementById('btn-leave-group');
if(btnLeaveGroup) {
    btnLeaveGroup.addEventListener('click', async () => {
        if(confirm("Bạn có chắc chắn muốn rời nhóm này?")) {
            const myName = currentUser.displayName || currentUser.email;
            await push(ref(db, `group_messages/${currentRoomId}`), { sender: 'system', text: `${myName} đã rời nhóm.`, timestamp: Date.now(), type: 'text' });
            await remove(ref(db, `rooms/${currentRoomId}/members/${currentUser.uid}`));
        }
    });
}
window.kickMember = (uid, memberName) => {
    if(confirm("Kick thành viên này khỏi nhóm?")) {
        remove(ref(db, `rooms/${currentRoomId}/members/${uid}`));
        push(ref(db, `group_messages/${currentRoomId}`), { sender: 'system', text: `${memberName} đã bị mời ra khỏi nhóm.`, timestamp: Date.now(), type: 'text' });
    }
};
window.promoteAdmin = (uid) => {
    if(confirm("Cấp quyền Quản trị viên cho người này?")) {
        update(ref(db, `rooms/${currentRoomId}/members/${uid}`), { role: 'admin' });
    }
};

/* ==========================================
    XỬ LÝ GỬI, TRẢ LỜI, GEMINI API
========================================== */
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

if(sendBtn && userInput) {
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    
    // Bắt sự kiện Ctrl + V (Paste ảnh)
    userInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                uploadFileToStorage(file);
            }
        }
    });
}

// Hàm huỷ Reply
document.getElementById('cancel-reply')?.addEventListener('click', () => {
    currentReplyData = null;
    document.getElementById('reply-preview').classList.add('hidden');
});

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';

    const isGroup = currentMode === 'group';
    const senderName = currentUser ? (currentUser.displayName || currentUser.email) : "Khách";
    const messageData = { 
        sender: 'user', text: text, type: 'text', name: senderName, 
        avatar: userAvatarStr, timestamp: Date.now() 
    };

    if (currentReplyData) {
        messageData.replyTo = currentReplyData;
        document.getElementById('cancel-reply').click();
    }

    if (isGroup) push(ref(db, `group_messages/${currentRoomId}`), messageData);
    else {
        if(currentUser) push(ref(db, `private_messages/${currentUser.uid}`), messageData);
        else {
            renderMessage('guest_temp_id', messageData, 'guest_temp_id');
            // Đồng bộ lịch sử theo mảng object của Gemini
            sessionHistory.push({ role: "user", parts: [{ text: text }] });
        }
    }

    let shouldCallAI = !isGroup || text.includes('@bot');

    if (shouldCallAI) {
        const typingId = "typing-" + Date.now();
        const typingMsg = { sender: 'ai', text: "...", name: "Trợ lý AI", avatar: botAvatarStr, type: 'text' };
        renderMessage(typingId, typingMsg, typingId);

        try {
            let apiMessages = [];
            if (!isGroup) {
                apiMessages = [...sessionHistory];
                if (apiMessages.length === 0 || apiMessages[apiMessages.length - 1].parts[0].text !== text) {
                    apiMessages.push({ role: "user", parts: [{ text: text }] });
                }
            } else {
                // Định dạng nội dung truy vấn trong phòng chat nhóm
                apiMessages = [
                    { role: "user", parts: [{ text: `(Yêu cầu: Giải đáp SQL) ${text.replace(/@bot/g, '').trim()}` }] }
                ];
            }

            // GỌI GEMINI API TRỰC TIẾP QUA FETCH TRÌNH DUYỆT
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    contents: apiMessages,
                    generationConfig: { temperature: 0.7 } 
                })
            });
            const data = await response.json();
            
            document.getElementById(typingId)?.remove();

            if (!response.ok || data.error) {
                if(!isGroup) {
                    const errMsg = { sender: 'ai', text: `⚠️ Lỗi API: ${data.error?.message || response.statusText}`, name: 'Trợ lý AI', type: 'text' };
                    renderMessage('error_id', errMsg);
                }
                return;
            }

            // Bóc tách dữ liệu phản hồi của cấu trúc JSON Gemini
            if (data.candidates && data.candidates.length > 0) {
                const aiReply = data.candidates[0].content.parts[0].text;
                const aiMsgData = { sender: 'ai', text: aiReply, type: 'text', name: 'Trợ lý AI', avatar: botAvatarStr, timestamp: Date.now() };

                if (isGroup) push(ref(db, `group_messages/${currentRoomId}`), aiMsgData);
                else {
                    if(currentUser) push(ref(db, `private_messages/${currentUser.uid}`), aiMsgData);
                    else {
                        renderMessage('guest_ai_id', aiMsgData, 'guest_ai_id');
                        sessionHistory.push({ role: "model", parts: [{ text: aiReply }] });
                    }
                }
            }
        } catch (error) {
            document.getElementById(typingId)?.remove();
            if(!isGroup) {
                const errMsg = { sender: 'ai', text: "Lỗi kết nối AI API! (Có thể do Key sai hoặc lỗi mạng)", name: 'Trợ lý AI', type: 'text' };
                renderMessage('error_conn', errMsg);
            }
        }
    }
}

/* ==========================================
    CÁC HÀM TƯƠNG TÁC TIN NHẮN (THU HỒI, SỬA, MENU)
========================================== */
window.handleDeleteMessage = function(msgId) {
    if(!confirm("Bạn muốn thu hồi tin nhắn này?")) return;
    const path = currentMode === 'group' ? `group_messages/${currentRoomId}/${msgId}` : `private_messages/${currentUser.uid}/${msgId}`;
    update(ref(db, path), { text: "Tin nhắn đã được thu hồi", type: "text" });
};

window.handleEditMessage = function(msgId, encodedOldText) {
    document.querySelectorAll('[id^="more-menu-"]').forEach(el => el.classList.add('hidden')); 
    const oldText = decodeURIComponent(encodedOldText);
    const newText = prompt("Chỉnh sửa tin nhắn:", oldText);
    if (newText && newText !== oldText) {
        const path = currentMode === 'group' ? `group_messages/${currentRoomId}/${msgId}` : `private_messages/${currentUser.uid}/${msgId}`;
        update(ref(db, path), { text: newText, isEdited: true });
    }
};

window.handleReplyBtn = function(msgId, name, encodedText) {
    currentReplyData = { id: msgId, name: name, text: decodeURIComponent(encodedText) };
    document.getElementById('reply-name').innerText = "Trả lời: " + name;
    document.getElementById('reply-text').innerText = currentReplyData.text;
    document.getElementById('reply-preview').classList.remove('hidden');
    document.getElementById('user-input').focus();
};

window.toggleMoreMenu = function(id) {
    document.querySelectorAll('[id^="react-menu-"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[id^="more-menu-"]').forEach(el => { if(el.id !== 'more-menu-'+id) el.classList.add('hidden')});
    document.getElementById('more-menu-' + id).classList.toggle('hidden');
};

window.toggleReactMenu = function(id) {
    document.querySelectorAll('[id^="more-menu-"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[id^="react-menu-"]').forEach(el => { if(el.id !== 'react-menu-'+id) el.classList.add('hidden')});
    document.getElementById('react-menu-' + id).classList.toggle('hidden');
};

window.sendReact = function(msgId, emoji) {
    if (!currentUser) return alert("Vui lòng đăng nhập để thả cảm xúc!");
    const path = currentMode === 'group' ? `group_messages/${currentRoomId}/${msgId}/reactions/${currentUser.uid}` : `private_messages/${currentUser.uid}/${msgId}/reactions/${currentUser.uid}`;
    set(ref(db, path), emoji);
    document.getElementById('react-menu-' + msgId)?.classList.add('hidden');
};

// Ẩn menu khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!e.target.closest('.msg-tools-container')) {
        document.querySelectorAll('[id^="react-menu-"], [id^="more-menu-"]').forEach(el => el.classList.add('hidden'));
    }
});

/* ==========================================
    RENDER TIN NHẮN CHÍNH
========================================== */
function renderMessage(msgId, msg, idOverride = null) {
    const chatBox = document.getElementById('chat-box');
    if(!chatBox || !msg) return;

    const { sender, text, type = 'text', isEdited = false, name: displayN, avatar: customAvatar, reactions, replyTo } = msg;

    const finalId = idOverride || `msg-${msgId}`;
    const msgDiv = document.createElement('div');
    msgDiv.id = finalId;
    
    if (sender === 'system') {
        msgDiv.className = "flex justify-center w-full my-3";
        msgDiv.innerHTML = `<span class="text-[10px] md:text-xs text-slate-500 bg-slate-200/60 px-4 py-1.5 rounded-full font-medium text-center shadow-sm">${text}</span>`;
        replaceOrAppendMessage(finalId, msgDiv, chatBox);
        return; 
    }

    const myName = currentUser ? (currentUser.displayName || currentUser.email) : "Khách";
    const isMe = (sender === 'user' && displayN === myName);
    const isAi = (sender === 'ai');

    msgDiv.className = `flex gap-2 md:gap-3 ${isMe ? 'flex-row-reverse' : ''} mb-5`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden ${isMe ? 'bg-slate-800 border border-slate-300' : (isAi ? 'bg-blue-500 border border-blue-200' : 'bg-gray-400')}`;
    if (customAvatar) avatarDiv.innerHTML = `<img src="${customAvatar}" class="w-full h-full object-cover">`;
    else avatarDiv.innerText = isMe ? "U" : (isAi ? "AI" : (displayN ? displayN.charAt(0).toUpperCase() : 'X'));

    const contentWrapper = document.createElement('div');
    contentWrapper.className = `flex flex-col max-w-[85%] md:max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`;

    const nameLabel = document.createElement('span');
    nameLabel.className = "text-[10px] md:text-xs text-slate-400 mb-1 px-1 font-medium";
    nameLabel.innerText = isMe ? "Bạn" : (isAi ? "🤖 Trợ lý AI" : displayN);
    
    const contentBox = document.createElement('div');
    contentBox.className = `p-3 rounded-2xl msg-content shadow-sm overflow-x-auto text-sm md:text-base relative ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`;
    
    let innerContent = '';
    
    // UI Trả lời tin nhắn
    if (replyTo) {
        innerContent += `
        <div class="bg-black/10 border-l-4 ${isMe ? 'border-white' : 'border-blue-500'} p-2 mb-2 rounded cursor-pointer hover:opacity-80 transition" onclick="document.getElementById('msg-${replyTo.id}')?.scrollIntoView({behavior: 'smooth'})">
            <strong class="block text-[10px] md:text-xs uppercase">${replyTo.name}</strong>
            <span class="truncate block max-w-[200px] text-xs opacity-90">${replyTo.text}</span>
        </div>`;
    }

    // UI Nội dung chính
    if (text === "Tin nhắn đã được thu hồi") {
        innerContent += `<em class="opacity-70 text-sm">Tin nhắn đã được thu hồi</em>`;
    } else if (type === 'image') {
        innerContent += `<img src="${text}" class="max-w-[250px] md:max-w-[350px] w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity" onclick="window.openImageViewer('${text}')">`;
    } else if (type === 'audio') {
        innerContent += `<audio controls class="h-10 w-48 md:w-64"><source src="${text}" type="audio/webm"></audio>`;
    } else if (text === "...") {
        innerContent += `<span class="w-2 h-2 bg-slate-400 rounded-full inline-block animate-bounce"></span>
                        <span class="w-2 h-2 bg-slate-400 rounded-full inline-block animate-bounce" style="animation-delay: 0.1s"></span>
                        <span class="w-2 h-2 bg-slate-400 rounded-full inline-block animate-bounce" style="animation-delay: 0.2s"></span>`;
    } else {
        if (typeof marked !== 'undefined') innerContent += marked.parse(text);
        else innerContent += text.replace(/\n/g, '<br>');
    }

    if (isEdited && text !== "Tin nhắn đã được thu hồi") {
        innerContent += `<div class="text-[10px] opacity-60 mt-1 ${isMe ? 'text-right' : 'text-left'}">(Đã sửa)</div>`;
    }
    
    contentBox.innerHTML = innerContent;

    // UI Cảm xúc (Reactions)
    if (reactions && Object.keys(reactions).length > 0) {
        const reactCounts = {};
        Object.values(reactions).forEach(r => { reactCounts[r] = (reactCounts[r] || 0) + 1; });
        const reactIcons = Object.keys(reactCounts).join('');
        const totalReacts = Object.keys(reactions).length;
        
        const reactBadge = document.createElement('div');
        reactBadge.className = `absolute -bottom-3 ${isMe ? 'left-2' : 'right-2'} bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-[11px] shadow flex items-center gap-1 z-10 cursor-pointer`;
        reactBadge.innerHTML = `<span>${reactIcons}</span> ${totalReacts > 1 ? `<span class="text-slate-500 font-bold">${totalReacts}</span>` : ''}`;
        contentBox.appendChild(reactBadge);
    }

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `flex items-center group w-full ${isMe ? 'flex-row-reverse' : 'flex-row'} gap-2`;
    bubbleWrapper.appendChild(contentBox);

    // Thanh Công Cụ (Reply, React, Thêm)
    if (text !== "Tin nhắn đã được thu hồi" && text !== "..." && !idOverride?.includes('temp') && currentUser) {
        const toolsDiv = document.createElement('div');
        toolsDiv.className = `hidden group-hover:flex items-center gap-0.5 px-1 text-slate-400 msg-tools-container ${isMe ? 'flex-row-reverse' : 'flex-row'}`;
        
        let safeText = '';
        try { safeText = encodeURIComponent(text); } catch(e) { safeText = encodeURIComponent("File đính kèm"); }

        // Nút Trả Lời
        toolsDiv.innerHTML += `
            <button onclick="handleReplyBtn('${msgId}', '${displayN}', '${safeText}')" class="p-1.5 hover:bg-slate-200 hover:text-blue-500 rounded-full transition" title="Trả lời">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            </button>`;
        
        // Nút Cảm Xúc
        toolsDiv.innerHTML += `
            <div class="relative flex items-center">
                <button onclick="toggleReactMenu('${msgId}')" class="p-1.5 hover:bg-slate-200 hover:text-pink-500 rounded-full transition" title="Thả cảm xúc">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </button>
                <div id="react-menu-${msgId}" class="hidden absolute ${isMe ? 'right-0' : 'left-0'} bottom-full mb-1 bg-white shadow-xl rounded-full px-2 py-1 flex gap-2 border border-slate-200 z-50 text-xl animate-fade-in-up">
                    <span class="cursor-pointer hover:scale-125 transition transform" onclick="sendReact('${msgId}', '👍')">👍</span>
                    <span class="cursor-pointer hover:scale-125 transition transform" onclick="sendReact('${msgId}', '❤️')">❤️</span>
                    <span class="cursor-pointer hover:scale-125 transition transform" onclick="sendReact('${msgId}', '😂')">😂</span>
                    <span class="cursor-pointer hover:scale-125 transition transform" onclick="sendReact('${msgId}', '😮')">😮</span>
                    <span class="cursor-pointer hover:scale-125 transition transform" onclick="sendReact('${msgId}', '😢')">😢</span>
                </div>
            </div>`;

        // Nút 3 chấm quản lý của chính mình
        if (isMe && type === 'text') {
            toolsDiv.innerHTML += `
            <div class="relative flex items-center">
                <button onclick="toggleMoreMenu('${msgId}')" class="p-1.5 hover:bg-slate-200 hover:text-slate-600 rounded-full transition" title="Thêm">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                </button>
                <div id="more-menu-${msgId}" class="hidden absolute right-0 bottom-full mb-1 bg-white shadow-xl rounded-lg flex flex-col border border-slate-200 z-50 text-sm w-24 overflow-hidden">
                    <button onclick="handleEditMessage('${msgId}', '${safeText}')" class="px-3 py-2 hover:bg-slate-100 text-left font-medium text-slate-700">Sửa</button>
                    <button onclick="handleDeleteMessage('${msgId}')" class="px-3 py-2 hover:bg-red-50 text-left font-medium text-red-600 border-t border-slate-100">Thu hồi</button>
                </div>
            </div>`;
        }

        bubbleWrapper.appendChild(toolsDiv);
    }

    contentWrapper.appendChild(nameLabel);
    contentWrapper.appendChild(bubbleWrapper);
    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentWrapper);
    
    replaceOrAppendMessage(finalId, msgDiv, chatBox);
}

function replaceOrAppendMessage(id, newElement, container) {
    const existingNode = document.getElementById(id);
    if (existingNode) {
        existingNode.replaceWith(newElement);
    } else {
        container.appendChild(newElement);
        container.scrollTop = container.scrollHeight;
    }
}

/* ==========================================
    TÍNH NĂNG UPLOAD ẢNH (DÙNG BASE64 - DATABASE)
========================================== */
function uploadFileToStorage(file) {
    if (!currentUser) {
        alert("Vui lòng đăng nhập để gửi file/ảnh!");
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        alert("Vui lòng chọn ảnh/file có dung lượng nhỏ hơn 2MB!");
        return;
    }

    const tempId = 'upload-' + Date.now();
    const tempMsg = { sender: 'user', text: "Đang xử lý ảnh/file...", type: 'text', name: currentUser.displayName, avatar: userAvatarStr };
    renderMessage(tempId, tempMsg, tempId);

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result;
        const isImage = file.type.startsWith('image/');
        const type = isImage ? 'image' : 'file';

        const path = currentMode === 'group' ? `group_messages/${currentRoomId}` : `private_messages/${currentUser.uid}`;
        
        document.getElementById(tempId)?.remove();
        
        push(ref(db, path), {
            sender: 'user', text: base64Data, type: type,
            name: currentUser.displayName, avatar: userAvatarStr, timestamp: Date.now()
        });
    };
    reader.readAsDataURL(file);
}

const fileUpload = document.getElementById('file-upload');
if (fileUpload) {
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFileToStorage(file);
    });
}

/* ==========================================
    TÍNH NĂNG GHI ÂM (DÙNG BASE64 - DATABASE)
========================================== */
let mediaRecorder;
let audioChunks = [];
const micBtn = document.getElementById('mic-btn');

if (micBtn) {
    micBtn.addEventListener('click', async () => {
        if (!currentUser) return alert("Vui lòng đăng nhập để sử dụng ghi âm!");

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    micBtn.classList.remove('animate-pulse', 'bg-red-500', 'text-white'); 
                    
                    const tempId = 'audio-' + Date.now();
                    const tempMsg = { sender: 'user', text: "Đang gửi âm thanh...", type: 'text', name: currentUser.displayName, avatar: userAvatarStr };
                    renderMessage(tempId, tempMsg, tempId);

                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const base64Audio = e.target.result;
                        const path = currentMode === 'group' ? `group_messages/${currentRoomId}` : `private_messages/${currentUser.uid}`;
                        
                        document.getElementById(tempId)?.remove();
                        
                        push(ref(db, path), {
                            sender: 'user', text: base64Audio, type: 'audio',
                            name: currentUser.displayName, avatar: userAvatarStr, timestamp: Date.now()
                        });
                    };
                    reader.readAsDataURL(audioBlob);
                };

                mediaRecorder.start();
                micBtn.classList.add('animate-pulse', 'bg-red-500', 'text-white'); 
            } catch (err) {
                alert("Không thể truy cập Micro. Hãy kiểm tra quyền truy cập trình duyệt!");
            }
        } else {
            mediaRecorder.stop();
        }
    });
}

/* ==========================================
    TÍNH NĂNG XEM ẢNH TOÀN MÀN HÌNH (LIGHTBOX)
========================================== */
window.openImageViewer = function(src) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    if(modal && img) {
        img.src = src;
        modal.classList.remove('hidden');
        setTimeout(() => img.classList.replace('scale-95', 'scale-100'), 10);
    }
};

window.closeImageViewer = function() {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('image-viewer-img');
    if(modal && img) {
        img.classList.replace('scale-100', 'scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            img.src = '';
        }, 200); 
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('close-image-viewer');
    const modal = document.getElementById('image-viewer-modal');
    
    if(closeBtn) closeBtn.addEventListener('click', closeImageViewer);
    if(modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeImageViewer(); 
        });
    }
});
