// ==========================================
// ĐIỀN API KEY BÍ MẬT CỦA BẠN VÀO ĐÂY
const API_KEY = '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'; 
// ==========================================
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// --- LOGIC CHO TRANG ĐĂNG NHẬP (auth.html) ---
function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const nameField = document.getElementById('name-field');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');

    if (nameField.classList.contains('hidden')) {
        // Chuyển sang Đăng ký
        title.innerText = 'Tạo tài khoản mới';
        nameField.classList.remove('hidden');
        submitBtn.innerText = 'Đăng ký ngay';
        toggleText.innerHTML = 'Đã có tài khoản? <span class="text-blue-600 font-bold cursor-pointer hover:underline" onclick="toggleAuthMode()">Đăng nhập</span>';
    } else {
        // Chuyển sang Đăng nhập
        title.innerText = 'Đăng nhập hệ thống';
        nameField.classList.add('hidden');
        submitBtn.innerText = 'Đăng nhập';
        toggleText.innerHTML = 'Chưa có tài khoản? <span class="text-blue-600 font-bold cursor-pointer hover:underline" onclick="toggleAuthMode()">Đăng ký ngay</span>';
    }
}

function handleAuthSubmit(event) {
    event.preventDefault();
    alert('Đăng nhập/Đăng ký thành công! Chuyển hướng đến trang Chat...');
    window.location.href = 'chat.html'; // Chuyển sang trang chat
}

// --- LOGIC CHO TRANG CHAT (chat.html) ---
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const robotBubble = document.getElementById('robot-bubble');

let chatHistory = [{ role: "system", content: "Bạn là AI giải bài tập SQL. Trả lời ngắn gọn, dùng Markdown format code." }];

// Chỉ chạy logic chat nếu đang ở trang chat.html
if (chatBox) {
    window.onload = () => {
        addMessageToUI('ai', "Chào bạn! Mình là Robot hỗ trợ giải SQL. Hãy gửi cho mình bài tập của bạn nhé.");
    };

    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessageToUI('user', text);
    userInput.value = '';
    chatHistory.push({ role: "user", content: text });
    updateRobotBubble("Đang vắt óc suy nghĩ...");

    const typingId = showTypingIndicator();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: chatHistory,
                temperature: 0.7
            })
        });

        const data = await response.json();
        removeElement(typingId);

        if (!response.ok) {
            addMessageToUI('ai', `❌ Lỗi API: Hãy chắc chắn bạn đã điền mã API vào script.js`);
            updateRobotBubble("Lỗi kết nối rồi!");
            chatHistory.pop();
            return;
        }

        if (data.choices && data.choices.length > 0) {
            const aiReply = data.choices[0].message.content;
            addMessageToUI('ai', aiReply);
            chatHistory.push({ role: "assistant", content: aiReply });
            
            // Cập nhật bong bóng robot
            let shortReply = aiReply.replace(/```[\s\S]*?```/g, "[Đoạn Code]").substring(0, 50) + "...";
            updateRobotBubble(shortReply);
        }
    } catch (error) {
        removeElement(typingId);
        addMessageToUI('ai', "❌ Lỗi mạng.");
        updateRobotBubble("Mất mạng rồi!");
    }
}

function updateRobotBubble(text) {
    robotBubble.innerHTML = text;
    robotBubble.classList.remove('opacity-0');
    setTimeout(() => { robotBubble.classList.add('opacity-0'); }, 5000);
}

function addMessageToUI(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `flex gap-4 ${sender === 'user' ? 'flex-row-reverse' : ''}`;
    
    const avatar = document.createElement('div');
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${sender === 'user' ? 'bg-slate-800' : 'bg-blue-500'}`;
    avatar.innerText = sender === 'user' ? 'U' : 'AI';

    const contentBox = document.createElement('div');
    contentBox.className = `p-4 rounded-2xl max-w-[80%] msg-content ${sender === 'user' ? 'bg-slate-100 border border-slate-200 text-slate-800 rounded-tr-none' : 'bg-blue-50 border border-blue-100 text-slate-800 rounded-tl-none'}`;
    
    if (typeof marked !== 'undefined') {
        contentBox.innerHTML = marked.parse(text);
    } else {
        contentBox.innerHTML = text.replace(/\n/g, '<br>');
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentBox);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = "flex gap-4";
    msgDiv.innerHTML = `
        <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-blue-500 flex-shrink-0">AI</div>
        <div class="p-4 rounded-2xl bg-blue-50 border border-blue-100 rounded-tl-none flex gap-1 items-center">
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
    `;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

function removeElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ==========================================
// TÍNH NĂNG ĐỔI AVATAR (Lưu bằng LocalStorage)
// ==========================================

// Lấy ảnh đã lưu từ trình duyệt (nếu có)
let userAvatarStr = localStorage.getItem('userAvatar') || null;
let botAvatarStr = localStorage.getItem('botAvatar') || null;

function openAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    const box = document.getElementById('avatar-box');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-95'); }, 10);

    // Hiển thị ảnh hiện tại lên màn hình cài đặt
    if(userAvatarStr) document.getElementById('preview-user').innerHTML = `<img src="${userAvatarStr}" class="w-full h-full object-cover">`;
    if(botAvatarStr) document.getElementById('preview-bot').innerHTML = `<img src="${botAvatarStr}" class="w-full h-full object-cover">`;
}

function closeAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    const box = document.getElementById('avatar-box');
    modal.classList.add('opacity-0'); box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

// Hàm đọc file ảnh khi người dùng chọn
function handleFileUpload(event, targetId) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Str = e.target.result;
            // Hiện thử ảnh xem trước
            document.getElementById(targetId).innerHTML = `<img src="${base64Str}" class="w-full h-full object-cover">`;
            // Giữ tạm trong DOM để khi bấm nút Lưu mới áp dụng
            document.getElementById(targetId).setAttribute('data-temp-src', base64Str);
        };
        reader.readAsDataURL(file); // Mã hóa ảnh thành Base64
    }
}

// Bắt sự kiện khi tải ảnh
document.getElementById('upload-user')?.addEventListener('change', (e) => handleFileUpload(e, 'preview-user'));
document.getElementById('upload-bot')?.addEventListener('change', (e) => handleFileUpload(e, 'preview-bot'));

// Lưu ảnh vào hệ thống
function saveAvatars() {
    const tempUser = document.getElementById('preview-user').getAttribute('data-temp-src');
    const tempBot = document.getElementById('preview-bot').getAttribute('data-temp-src');

    if (tempUser) { userAvatarStr = tempUser; localStorage.setItem('userAvatar', tempUser); }
    if (tempBot) { botAvatarStr = tempBot; localStorage.setItem('botAvatar', tempBot); }

    closeAvatarModal();
    alert('Đã cập nhật ảnh đại diện thành công! Các tin nhắn tiếp theo sẽ áp dụng ảnh mới.');
}


// ==========================================
// (XÓA HÀM CŨ) CẬP NHẬT 2 HÀM HIỂN THỊ TIN NHẮN DƯỚI ĐÂY
// ==========================================

function addMessageToUI(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `flex gap-4 ${sender === 'user' ? 'flex-row-reverse' : ''}`;
    
    const avatar = document.createElement('div');
    avatar.className = `w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden ${sender === 'user' ? 'bg-slate-800 border-2 border-slate-300' : 'bg-blue-500 border-2 border-blue-200'}`;
    
    // KIỂM TRA: Nếu có ảnh thì dùng ảnh, không thì hiện chữ
    let avatarSrc = sender === 'user' ? userAvatarStr : botAvatarStr;
    if (avatarSrc) {
        avatar.innerHTML = `<img src="${avatarSrc}" class="w-full h-full object-cover">`;
    } else {
        avatar.innerText = sender === 'user' ? 'U' : 'AI';
    }

    const contentBox = document.createElement('div');
    contentBox.className = `p-4 rounded-2xl max-w-[80%] msg-content ${sender === 'user' ? 'bg-slate-100 border border-slate-200 text-slate-800 rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'}`;
    
    if (typeof marked !== 'undefined') {
        contentBox.innerHTML = marked.parse(text);
    } else {
        contentBox.innerHTML = text.replace(/\n/g, '<br>');
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentBox);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = "flex gap-4";
    
    // Lấy ảnh bot nếu có
    const avatarContent = botAvatarStr 
        ? `<img src="${botAvatarStr}" class="w-full h-full object-cover">` 
        : `AI`;

    msgDiv.innerHTML = `
        <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold bg-blue-500 flex-shrink-0 overflow-hidden border-2 border-blue-200">
            ${avatarContent}
        </div>
        <div class="p-4 rounded-2xl bg-white border border-slate-200 rounded-tl-none flex gap-1 items-center shadow-sm">
            <span class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
            <span class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
            <span class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
        </div>
    `;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}