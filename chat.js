const mqtt = require("mqtt");
const readline = require("readline");
const crypto = require("crypto");

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

let myname = "";
let SECRET_KEY;

// 🧠 AES config
const IV = Buffer.alloc(16, 0); // ถ้าจะให้ปลอดภัยควรสุ่ม
const PREFIX = "SECMSG::"; // ป้องกัน decode ข้อความมั่วๆ

// ฟังก์ชันเข้ารหัส
function encrypt(text) {
	const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, IV);
	let encrypted = cipher.update(PREFIX + text, "utf8", "hex");
	encrypted += cipher.final("hex");
	return encrypted;
}

// ฟังก์ชันถอดรหัส
function decrypt(encrypted) {
	try {
		const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, IV);
		let decrypted = decipher.update(encrypted, "hex", "utf8");
		decrypted += decipher.final("utf8");

		if (!decrypted.startsWith(PREFIX)) throw new Error("Invalid prefix");
		return decrypted.replace(PREFIX, "");
	} catch {
		return null; // ❌ ถอดไม่ได้ให้ข้าม
	}
}

// ถามชื่อและ key
rl.question("👤 What's your name?: ", name => {
	myname = name.trim();

	rl.question("🔑 Enter secret key: ", key => {
		SECRET_KEY = crypto.createHash("sha256").update(key).digest();
		startChat();
	});
});

function startChat() {
	const client = mqtt.connect("mqtt://broker.hivemq.com");

	client.on("connect", () => {
		console.log(`✅ Connected as ${myname}. You can start chatting.`);
		client.subscribe("chat/secure-room", err => {
			if (!err) promptMessage();
		});
	});

	client.on("message", (topic, message) => {
		try {
			const { name, encryptedMessage } = JSON.parse(message.toString());
			if (name !== myname) {
				const text = decrypt(encryptedMessage);
				if (text) {
					process.stdout.clearLine(0);
					process.stdout.cursorTo(0);
					console.log(`💬 ${name}: ${text}`);
					promptMessage(true);
				}
			}
		} catch {
			// ❌ ข้ามข้อความที่ไม่ใช่ format ที่เรารู้จัก
		}
	});

	function promptMessage(skipPrompt = false) {
		if (skipPrompt) {
			rl.prompt();
			return;
		}

		rl.question("> ", text => {
			const encrypted = encrypt(text);
			const payload = JSON.stringify({ name: myname, encryptedMessage: encrypted });
			client.publish("chat/secure-room", payload);
			promptMessage();
		});
	}
}
