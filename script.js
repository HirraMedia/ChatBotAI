import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getDatabase, ref, push, onChildAdded, onValue, off, get, update, remove, set } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

let currentUser = null;
let currentMode = 'private'; 
let currentRoomId = null;
let currentRoomData = null; 
let currentChatListener = null; 
let sessionHistory = [{ role: "system", content: "Bạn là AI giải bài tập SQL." }];

let userAvatarStr = localStorage.getItem('userAvatar') || null;
let botAvatarStr = localStorage.getItem('botAvatar') || null;

/* ==========================================
   QUẢN LÝ TÀI KHOẢN & KHỞI ĐỘNG
========================================== */
const authBtn = document.getElementById('auth-action-btn');
const authBtnText = document.getElementById('auth-btn-text');
const authGearIcon = document.getElementById('auth-gear-icon');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const displayName = user.displayName || user.email;
        document.getElementById('user-email-display').innerText = "Tài khoản: " + displayName;
        
        // Đổi chữ ở đây cho ngắn gọn
        authBtnText.innerText = "Tài khoản"; 
        authGearIcon.classList.remove('hidden'); 
        
        await checkInviteLink();
    } else {
        currentUser = null;
        document.getElementById('user-email-display').innerText = "Trạng thái: Khách (Chưa đăng nhập)";
        authBtnText.innerText = "Đăng nhập";
        authGearIcon.classList.add('hidden'); 
    }
    loadRooms(); 
    if(!currentRoomId) openPrivateChat(); 
});

authBtn.addEventListener('click', () => {
    if (!currentUser) window.location.href = 'auth.html'; 
    else {
        // Mở cài đặt
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('settings-name-input').value = currentUser.displayName || '';
        tempSettingsAvatar = userAvatarStr;
        updateSettingsPreview();
    }
});

/* ==========================================
   LINK MỜI THAM GIA NHÓM
========================================== */
async function checkInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteRoomId = urlParams.get('join');
    if (!inviteRoomId || !currentUser) return;

    // Lấy thông tin phòng
    const snapshot = await get(ref(db, `rooms/${inviteRoomId}`));
    if (!snapshot.exists()) {
        alert("Nhóm không tồn tại hoặc đã bị xóa!");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    const rData = snapshot.val();
    
    // Kiểm tra xem đã là thành viên chưa
    if (rData.members && rData.members[currentUser.uid]) {
        // Đã là thành viên, join luôn
        executeJoinRoom(inviteRoomId, rData);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // Hiện popup mời
    document.getElementById('invite-link-modal').classList.remove('hidden');
    document.getElementById('invite-link-modal').children[0].classList.replace('scale-95', 'scale-100');
    
    document.getElementById('invite-room-name').innerText = rData.name;
    document.getElementById('invite-avatar').innerHTML = rData.avatar 
        ? `<img src="${rData.avatar}" class="w-full h-full object-cover">` 
        : `<span class="text-4xl text-slate-400 font-bold">#</span>`;

    const pwdArea = document.getElementById('invite-password-area');
    if (rData.type === 'private') pwdArea.classList.remove('hidden');
    else pwdArea.classList.add('hidden');

    // Nút tham gia
    document.getElementById('btn-accept-invite').onclick = async () => {
        if (rData.type === 'private') {
            const pwd = document.getElementById('invite-password').value;
            if (pwd !== rData.password) return alert("Mật khẩu nhóm không đúng!");
        }
        
        // Thêm vào database members
        await set(ref(db, `rooms/${inviteRoomId}/members/${currentUser.uid}`), {
            name: currentUser.displayName || currentUser.email,
            avatar: userAvatarStr,
            role: 'member'
        });

        document.getElementById('invite-link-modal').classList.add('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
        executeJoinRoom(inviteRoomId, rData);
    };

    // Nút từ chối
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
    if (tempSettingsAvatar) {
        previewBox.innerHTML = `<img src="${tempSettingsAvatar}" class="w-full h-full object-cover">`;
    } else {
        const firstLetter = (currentUser.displayName || currentUser.email).charAt(0).toUpperCase();
        previewBox.innerHTML = `<span class="text-slate-500 text-3xl font-bold">${firstLetter}</span>`;
    }
}

document.getElementById('close-settings-modal').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('hidden');
});

document.getElementById('settings-avatar-upload').addEventListener('change', (e) => {
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

document.getElementById('save-settings-btn').addEventListener('click', () => {
    const newName = document.getElementById('settings-name-input').value.trim();
    if (!newName) return alert("Tên không được để trống!");

    if (tempSettingsAvatar) {
        userAvatarStr = tempSettingsAvatar;
        localStorage.setItem('userAvatar', tempSettingsAvatar);
    }

    document.getElementById('save-settings-btn').innerText = "Đang lưu...";
    updateProfile(currentUser, { displayName: newName }).then(() => {
        document.getElementById('save-settings-btn').innerText = "Lưu Thay Đổi";
        document.getElementById('user-email-display').innerText = "Tài khoản: " + newName;
        document.getElementById('settings-modal').classList.add('hidden');
        
        // Update user name in current room members if in a group
        if (currentMode === 'group' && currentRoomId) {
            update(ref(db, `rooms/${currentRoomId}/members/${currentUser.uid}`), { name: newName, avatar: userAvatarStr });
        }
        alert("Cập nhật thông tin thành công!");
    });
});

document.getElementById('logout-settings-btn').addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        signOut(auth).then(() => {
            document.getElementById('settings-modal').classList.add('hidden');
            window.location.reload();
        });
    }
});

/* ==========================================
   TẠO VÀ HIỂN THỊ NHÓM
========================================== */
let roomType = 'public';
let roomAvatarBase64 = null;

document.getElementById('btn-open-create-room').addEventListener('click', () => {
    if (!currentUser) return alert("Bạn phải Đăng nhập để tạo nhóm chat!");
    document.getElementById('create-room-modal').classList.remove('hidden');
});

document.getElementById('close-create-room').addEventListener('click', () => document.getElementById('create-room-modal').classList.add('hidden'));

document.getElementById('btn-public').addEventListener('click', () => {
    roomType = 'public';
    document.getElementById('btn-public').className = "flex-1 py-2 rounded-lg font-medium border-2 border-blue-600 bg-blue-50 text-blue-600";
    document.getElementById('btn-private').className = "flex-1 py-2 rounded-lg font-medium border-2 border-slate-200 bg-white text-slate-600";
    document.getElementById('room-password-container').classList.add('hidden');
});

document.getElementById('btn-private').addEventListener('click', () => {
    roomType = 'private';
    document.getElementById('btn-private').className = "flex-1 py-2 rounded-lg font-medium border-2 border-blue-600 bg-blue-50 text-blue-600";
    document.getElementById('btn-public').className = "flex-1 py-2 rounded-lg font-medium border-2 border-slate-200 bg-white text-slate-600";
    document.getElementById('room-password-container').classList.remove('hidden');
});

document.getElementById('room-avatar-upload').addEventListener('change', (e) => {
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

document.getElementById('confirm-create-room').addEventListener('click', async () => {
    const name = document.getElementById('room-name-input').value.trim();
    const password = document.getElementById('room-password-input').value;
    
    if (!name) return alert("Vui lòng nhập tên nhóm!");
    if (roomType === 'private' && !password) return alert("Vui lòng nhập mật khẩu cho nhóm bảo mật!");

    const newRoomRef = push(ref(db, 'rooms'));
    await set(newRoomRef, { 
        name: name, 
        type: roomType, 
        password: roomType === 'private' ? password : "",
        avatar: roomAvatarBase64,
        timestamp: Date.now(),
        creatorId: currentUser.uid,
        members: {
            [currentUser.uid]: {
                name: currentUser.displayName || currentUser.email,
                avatar: userAvatarStr,
                role: 'creator' // Roles: creator, admin, member
            }
        }
    });
    
    document.getElementById('create-room-modal').classList.add('hidden');
    document.getElementById('room-name-input').value = "";
    document.getElementById('room-password-input').value = "";
    document.getElementById('room-avatar-preview').innerHTML = `<span class="text-slate-500 text-sm">Ảnh</span>`;
    roomAvatarBase64 = null;
    alert("Tạo nhóm thành công!");
});

function loadRooms() {
    const roomListDiv = document.getElementById('room-list');
    onValue(ref(db, 'rooms'), (snapshot) => {
        roomListDiv.innerHTML = '<p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Cộng đồng (Nhóm chung)</p>';
        snapshot.forEach((childSnapshot) => {
            const room = childSnapshot.val();
            const roomId = childSnapshot.key;
            
            // Chỉ hiển thị phòng nếu là Public, hoặc Private nhưng mình có trong members
            const isMember = currentUser && room.members && room.members[currentUser.uid];
            if (room.type === 'private' && !isMember) return; 
            
            const btn = document.createElement('div');
            btn.className = "group flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 cursor-pointer transition-all border border-transparent";
            
            let avatarHtml = room.avatar ? `<img src="${room.avatar}" class="w-full h-full object-cover">` : `#`;
            let lockIcon = room.type === 'private' ? `<span class="text-xs text-slate-400">🔒</span>` : '';

            // Thêm nút X (btn-delete-room-super) ẩn đi, chỉ hiện khi hover chuột (group-hover:flex)
            btn.innerHTML = `
                <div class="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300 font-bold overflow-hidden">${avatarHtml}</div>
                <h3 class="font-medium text-sm text-slate-300 group-hover:text-white flex-1 truncate">${room.name}</h3>
                <div class="flex items-center gap-2 ml-auto">
                    ${lockIcon}
                    <button class="hidden group-hover:flex w-6 h-6 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded items-center justify-center transition-colors text-xs btn-delete-room-super" title="Xóa nhóm cấp cao">✖</button>
                </div>
            `;
            
            // Bắt sự kiện khi click vào dòng nhóm để tham gia
            btn.addEventListener('click', (e) => {
                // Bỏ qua nếu người dùng đang bấm vào nút X
                if (e.target.closest('.btn-delete-room-super')) return;
                handleJoinRoomReq(roomId, room);
            });

            // LOGIC QUYỀN TỐI CAO: Xử lý khi bấm nút X
            const deleteBtn = btn.querySelector('.btn-delete-room-super');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Ngăn việc click bị lẫn sang lệnh vào nhóm
                
                // Hiển thị bảng nhập mật khẩu
                const pass = prompt("🔐 YÊU CẦU QUYỀN TỐI CAO:\nNhập mật khẩu cấp cao nhất để xóa nhóm:");
                
                if (pass === "10101010") {
                    if (confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN nhóm "${room.name}" không?`)) {
                        // Xóa dữ liệu phòng và tin nhắn trên Firebase
                        remove(ref(db, `rooms/${roomId}`));
                        remove(ref(db, `group_messages/${roomId}`));
                        alert("✅ Đã xóa nhóm thành công!");
                        
                        // Nếu đang ở trong chính nhóm bị xóa thì đẩy ra ngoài Chat riêng tư
                        if (currentRoomId === roomId) {
                            openPrivateChat();
                        }
                    }
                } else if (pass !== null) {
                    // Nếu nhập sai mật khẩu (và không bấm Hủy)
                    alert("❌ Mật khẩu cấp cao không chính xác!");
                }
            });

            roomListDiv.appendChild(btn);
        });
    });
}

/* ==========================================
   VÀO NHÓM VÀ TÙY CHỌN NHÓM
========================================== */
let pendingRoomId = null;
let pendingRoomData = null;

function handleJoinRoomReq(roomId, roomData) {
    if (!currentUser) return alert("Bạn cần Đăng nhập để vào nhóm!");

    const isMember = roomData.members && roomData.members[currentUser.uid];

    // Nếu đã là member rồi thì vào thẳng không cần hỏi pass
    if (isMember || roomData.type === 'public') {
        if (!isMember) {
            // Public chưa join -> Join
            set(ref(db, `rooms/${roomId}/members/${currentUser.uid}`), {
                name: currentUser.displayName || currentUser.email,
                avatar: userAvatarStr,
                role: 'member'
            });
        }
        executeJoinRoom(roomId, roomData);
    } else {
        // Nhóm private chưa join -> Yêu cầu pass
        pendingRoomId = roomId;
        pendingRoomData = roomData;
        document.getElementById('join-password').value = "";
        document.getElementById('join-room-modal').classList.remove('hidden');
    }
}

document.getElementById('cancel-join-room').addEventListener('click', () => { document.getElementById('join-room-modal').classList.add('hidden'); });

document.getElementById('confirm-join-room').addEventListener('click', async () => {
    const pass = document.getElementById('join-password').value;
    if (pass !== pendingRoomData.password) return alert("Mật khẩu nhóm không đúng!");
    
    await set(ref(db, `rooms/${pendingRoomId}/members/${currentUser.uid}`), {
        name: currentUser.displayName || currentUser.email,
        avatar: userAvatarStr,
        role: 'member'
    });

    document.getElementById('join-room-modal').classList.add('hidden');
    executeJoinRoom(pendingRoomId, pendingRoomData);
});

let roomListener = null; // Lắng nghe data thay đổi trong phòng

function executeJoinRoom(roomId, roomData) {
    currentMode = 'group';
    currentRoomId = roomId;
    currentRoomData = roomData;

    document.getElementById('btn-private-chat').classList.replace('bg-blue-600', 'bg-slate-800');
    document.getElementById('btn-group-options').classList.remove('hidden'); // Mở khóa nút Tùy chọn nhóm

    document.getElementById('room-title').innerHTML = `<span id="room-icon">🌍</span> Nhóm: <span id="header-room-name">${roomData.name}</span>`;
    document.getElementById('user-input').placeholder = "Nhắn với nhóm (Tag @bot để gọi AI)...";

    // Lắng nghe thay đổi của phòng (Tên, Ảnh, Thành viên)
    if (roomListener) off(roomListener);
    roomListener = ref(db, `rooms/${roomId}`);
    onValue(roomListener, (snap) => {
        if (snap.exists()) {
            currentRoomData = snap.val();
            // Nếu bị kick
            if (!currentRoomData.members || !currentRoomData.members[currentUser.uid]) {
                alert("Bạn đã bị quản trị viên mời ra khỏi nhóm!");
                openPrivateChat();
                return;
            }
            document.getElementById('header-room-name').innerText = currentRoomData.name;
            renderDrawerData();
        } else {
            // Nhóm bị xóa
            alert("Nhóm đã bị giải tán!");
            openPrivateChat();
        }
    });

    if (currentChatListener) off(currentChatListener);
    document.getElementById('chat-box').innerHTML = '';

    const chatRef = ref(db, `group_messages/${roomId}`);
    currentChatListener = chatRef;
    onChildAdded(chatRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg.sender, msg.text, msg.name, msg.avatar);
    });
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
    document.getElementById('chat-box').innerHTML = ''; 
    sessionHistory = [{ role: "system", content: "Bạn là AI giải bài tập SQL." }];

    if (currentUser) {
        const chatRef = ref(db, `private_messages/${currentUser.uid}`);
        currentChatListener = chatRef;
        onChildAdded(chatRef, (snapshot) => {
            const msg = snapshot.val();
            renderMessage(msg.sender, msg.text, msg.name || msg.email, msg.avatar);
            sessionHistory.push({ role: msg.sender === 'ai' ? "assistant" : "user", content: msg.text });
        });
    } else {
        renderMessage('ai', 'Chào bạn! Đăng nhập để AI có thể lưu lại lịch sử nhé!', 'Trợ lý AI');
    }
}

/* ==========================================
   DRAWER TÙY CHỌN NHÓM
========================================== */
const drawer = document.getElementById('group-drawer');
document.getElementById('btn-group-options').addEventListener('click', () => {
    drawer.classList.remove('translate-x-full');
    renderDrawerData();
});
document.getElementById('close-drawer-btn').addEventListener('click', closeGroupDrawer);

function closeGroupDrawer() {
    drawer.classList.add('translate-x-full');
}

// Render dữ liệu lên Drawer
function renderDrawerData() {
    if (!currentRoomData || !currentRoomData.members) return;
    
    const myRole = currentRoomData.members[currentUser.uid]?.role || 'member';
    const isCreator = myRole === 'creator';
    const isAdmin = myRole === 'admin' || isCreator;

    // Ảnh
    const avatarBox = document.getElementById('drawer-group-avatar');
    avatarBox.innerHTML = currentRoomData.avatar ? `<img src="${currentRoomData.avatar}" class="w-full h-full object-cover">` : `<span class="text-slate-400 font-bold text-xl">#</span>`;
    
    // Tên
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

    // Xóa Nhóm (Chỉ Creator)
    if (isCreator) document.getElementById('drawer-admin-actions').classList.remove('hidden');
    else document.getElementById('drawer-admin-actions').classList.add('hidden');

    // List Members
    const membersArr = Object.entries(currentRoomData.members);
    document.getElementById('member-count').innerText = membersArr.length;
    const listDiv = document.getElementById('drawer-member-list');
    listDiv.innerHTML = '';

    membersArr.forEach(([uid, mData]) => {
        const isMe = uid === currentUser.uid;
        
        let roleBadge = '';
        if (mData.role === 'creator') roleBadge = `<span class="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200">Người tạo</span>`;
        else if (mData.role === 'admin') roleBadge = `<span class="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded border border-blue-200">Quản trị</span>`;

        // Nút Kéo Thả (Kick / Admin)
        let actionsHtml = '';
        if (!isMe && isAdmin) { // Không tự xử mình, admin xử người khác
            // Không được xử creator, Admin ko xử được Admin khác
            if (mData.role !== 'creator' && !(myRole === 'admin' && mData.role === 'admin')) {
                let promoteBtn = isCreator && mData.role === 'member' ? `<button onclick="promoteAdmin('${uid}')" class="text-xs text-blue-600 hover:underline">Thăng cấp</button>` : '';
                let kickBtn = `<button onclick="kickMember('${uid}')" class="text-xs text-red-600 hover:underline">Kick</button>`;
                actionsHtml = `<div class="flex gap-2">${promoteBtn}${kickBtn}</div>`;
            }
        }

        const avatarH = mData.avatar ? `<img src="${mData.avatar}" class="w-full h-full object-cover">` : `<span class="text-xs">${mData.name.charAt(0)}</span>`;
        
        listDiv.innerHTML += `
            <div class="flex items-center justify-between p-2 hover:bg-slate-100 rounded-lg group">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center font-bold overflow-hidden">${avatarH}</div>
                    <div class="flex flex-col">
                        <span class="text-sm font-medium text-slate-700">${mData.name} ${isMe ? '(Bạn)' : ''}</span>
                        ${roleBadge}
                    </div>
                </div>
                ${actionsHtml}
            </div>
        `;
    });
}

// Hành động Drawer
document.getElementById('edit-group-avatar').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            update(ref(db, `rooms/${currentRoomId}`), { avatar: event.target.result });
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('btn-save-group-name').addEventListener('click', () => {
    const newName = document.getElementById('drawer-group-name').value.trim();
    if (newName) {
        update(ref(db, `rooms/${currentRoomId}`), { name: newName });
        document.getElementById('btn-save-group-name').classList.add('hidden');
    }
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
    const inviteLink = window.location.origin + window.location.pathname + '?join=' + currentRoomId;
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert("Đã copy link mời! Hãy gửi cho bạn bè nhé.");
    });
});

document.getElementById('btn-delete-group').addEventListener('click', () => {
    if(confirm("Bạn có chắc chắn muốn giải tán nhóm này vĩnh viễn?")) {
        remove(ref(db, `rooms/${currentRoomId}`));
        remove(ref(db, `group_messages/${currentRoomId}`));
    }
});

// Các hàm thao tác với member global để nút trong HTML gọi được
window.kickMember = (uid) => {
    if(confirm("Kick thành viên này khỏi nhóm?")) {
        remove(ref(db, `rooms/${currentRoomId}/members/${uid}`));
    }
};

window.promoteAdmin = (uid) => {
    if(confirm("Cấp quyền Quản trị viên cho người này?")) {
        update(ref(db, `rooms/${currentRoomId}/members/${uid}`), { role: 'admin' });
    }
};

/* ==========================================
   XỬ LÝ GỬI TIN NHẮN CHAT
========================================== */
const userInput = document.getElementById('user-input');
document.getElementById('send-btn').addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;
    userInput.value = '';

    const isGroup = currentMode === 'group';
    const senderName = currentUser ? (currentUser.displayName || currentUser.email) : "Khách";

    const messageData = { 
        sender: 'user', 
        text: text, 
        name: senderName,
        avatar: userAvatarStr,
        timestamp: Date.now() 
    };

    if (isGroup) push(ref(db, `group_messages/${currentRoomId}`), messageData);
    else {
        if(currentUser) push(ref(db, `private_messages/${currentUser.uid}`), messageData);
        else {
            renderMessage('user', text, 'Khách', null);
            sessionHistory.push({ role: "user", content: text });
        }
    }

    let shouldCallAI = !isGroup || text.includes('@bot');

    if (shouldCallAI) {
        const typingId = "typing-" + Date.now();
        renderMessage('ai', "...", "Trợ lý AI", botAvatarStr, typingId);

        try {
            let apiMessages = [];
            if (!isGroup) apiMessages = sessionHistory; 
            else apiMessages = [{ role: "user", content: `(Chuyên môn SQL) ${text.replace(/@bot/g, '').trim()}` }];

            const response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: apiMessages })
            });

            const data = await response.json();
            document.getElementById(typingId)?.remove();

            if (data.choices && data.choices.length > 0) {
                const aiReply = data.choices[0].message.content;
                const aiMsgData = { sender: 'ai', text: aiReply, name: 'Trợ lý AI', avatar: botAvatarStr, timestamp: Date.now() };

                if (isGroup) push(ref(db, `group_messages/${currentRoomId}`), aiMsgData);
                else {
                    if(currentUser) push(ref(db, `private_messages/${currentUser.uid}`), aiMsgData);
                    else {
                        renderMessage('ai', aiReply, 'Trợ lý AI', botAvatarStr);
                        sessionHistory.push({ role: "assistant", content: aiReply });
                    }
                }
            }
        } catch (error) {
            document.getElementById(typingId)?.remove();
            if(!isGroup) renderMessage('ai', "Lỗi kết nối AI API!", 'Trợ lý AI');
        }
    }
}

function renderMessage(sender, text, displayN, customAvatar, idOverride = null) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    if (idOverride) msgDiv.id = idOverride;
    
    const myName = currentUser ? (currentUser.displayName || currentUser.email) : "Khách";
    const isMe = (sender === 'user' && displayN === myName);
    const isAi = (sender === 'ai');

    msgDiv.className = `flex gap-4 ${isMe ? 'flex-row-reverse' : ''} mb-4`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = `w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden ${isMe ? 'bg-slate-800 border-2 border-slate-300' : (isAi ? 'bg-blue-500 border-2 border-blue-200' : 'bg-gray-400')}`;
    if (customAvatar) avatarDiv.innerHTML = `<img src="${customAvatar}" class="w-full h-full object-cover">`;
    else avatarDiv.innerText = isMe ? "U" : (isAi ? "AI" : (displayN ? displayN.charAt(0).toUpperCase() : 'X'));

    const contentWrapper = document.createElement('div');
    contentWrapper.className = `flex flex-col max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`;

    const nameLabel = document.createElement('span');
    nameLabel.className = "text-xs text-slate-400 mb-1 px-1 font-medium";
    nameLabel.innerText = isMe ? "Bạn" : (isAi ? "🤖 Trợ lý AI" : displayN);
    
    const contentBox = document.createElement('div');
    contentBox.className = `p-4 rounded-2xl msg-content shadow-sm overflow-x-auto ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`;
    
    if (text === "...") {
        contentBox.innerHTML = `<span class="w-2 h-2 bg-slate-400 rounded-full inline-block animate-bounce"></span>
                                <span class="w-2 h-2 bg-slate-400 rounded-full inline-block animate-bounce" style="animation-delay: 0.1s"></span>
                                <span class="w-2 h-2 bg-slate-400 rounded-full inline-block animate-bounce" style="animation-delay: 0.2s"></span>`;
    } else {
        if (typeof marked !== 'undefined') contentBox.innerHTML = marked.parse(text);
        else contentBox.innerHTML = text.replace(/\n/g, '<br>');
    }

    contentWrapper.appendChild(nameLabel);
    contentWrapper.appendChild(contentBox);
    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(contentWrapper);
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}
