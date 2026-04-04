const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { execSync } = require("child_process");

const HF_TOKEN = process.env.HF_TOKEN;
const FB_TOKEN = "6628568379%7Cc1e620fa708a1d5696fb991c1bde5662";

function easeInOut(t) {
	return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
function easeOut(t) {
	return 1 - Math.pow(1 - t, 3);
}

async function fetchProfilePic(userID, savePath) {
	const url = `https://graph.facebook.com/${userID}/picture?width=720&height=720&access_token=${FB_TOKEN}`;
	const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, maxRedirects: 10 });
	fs.writeFileSync(savePath, Buffer.from(res.data));
}

async function detectFace(imagePath) {
	try {
		const imageBuffer = fs.readFileSync(imagePath);
		const res = await axios.post(
			"https://api-inference.huggingface.co/models/facebook/detr-resnet-50",
			imageBuffer,
			{
				headers: {
					Authorization: `Bearer ${HF_TOKEN}`,
					"Content-Type": "image/jpeg",
					"x-wait-for-model": "true"
				},
				timeout: 45000
			}
		);
		const items = res.data || [];
		const person = items.find(d => d.label === "person");
		if (person && person.box) return person.box;
	} catch (e) {
		console.error("[قبلة][FaceDetect]", e.message);
	}
	return null;
}

async function captionImage(imagePath) {
	try {
		const imageBuffer = fs.readFileSync(imagePath);
		const res = await axios.post(
			"https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base",
			imageBuffer,
			{
				headers: {
					Authorization: `Bearer ${HF_TOKEN}`,
					"Content-Type": "image/jpeg",
					"x-wait-for-model": "true"
				},
				timeout: 45000
			}
		);
		const data = res.data;
		if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;
	} catch (e) {
		console.error("[قبلة][Caption]", e.message);
	}
	return null;
}

async function generateRomanticStory(name1, name2, desc1, desc2) {
	try {
		const prompt = `اكتب قصة رومانسية قصيرة وجميلة لا تتجاوز 3 جمل بين شخصين اسمهما ${name1} و${name2}. ${desc1 ? `${name1} يبدو: ${desc1}.` : ""} ${desc2 ? `${name2} يبدو: ${desc2}.` : ""} اجعل القصة باللغة العربية ومليئة بالمشاعر والرومانسية.`;
		const res = await axios.get(
			`https://betadash-api-swordslush-production.up.railway.app/you?chat=${encodeURIComponent(prompt)}`,
			{ timeout: 20000 }
		);
		const story = res.data?.response;
		if (story) return story;
	} catch (e) {
		console.error("[قبلة][Story]", e.message);
	}
	return null;
}

function getFaceCenterFromBox(box, imgW, imgH) {
	if (!box) return { cx: 0.5, cy: 0.4 };
	const cx = ((box.xmin + box.xmax) / 2) / imgW;
	const cy = ((box.ymin + box.ymax) / 2) / imgH;
	return { cx, cy };
}

function drawSplitKissFrame(ctx, img1, img2, box1, box2, W, H, progress, senderName, targetName) {
	const phase1End = 0.30;
	const phase2End = 0.65;
	const phase3End = 0.85;

	const face1 = getFaceCenterFromBox(box1, 720, 720);
	const face2 = getFaceCenterFromBox(box2, 720, 720);

	let zoom, panOffset, bgAlpha, nameAlpha, kissAlpha;

	if (progress <= phase1End) {
		const p = easeInOut(progress / phase1End);
		zoom = 1.0 + p * 0.3;
		panOffset = 0;
		bgAlpha = p;
		nameAlpha = 0;
		kissAlpha = 0;
	} else if (progress <= phase2End) {
		const p = easeInOut((progress - phase1End) / (phase2End - phase1End));
		zoom = 1.3 + p * 0.5;
		panOffset = p * 0.18;
		bgAlpha = 1;
		nameAlpha = 0;
		kissAlpha = 0;
	} else if (progress <= phase3End) {
		const p = easeOut((progress - phase2End) / (phase3End - phase2End));
		zoom = 1.8 + p * 0.35;
		panOffset = 0.18 + p * 0.10;
		bgAlpha = 1;
		nameAlpha = 0;
		kissAlpha = p * 0.7;
	} else {
		const p = easeOut((progress - phase3End) / (1.0 - phase3End));
		zoom = 2.15 + p * 0.05;
		panOffset = 0.28;
		bgAlpha = 1;
		nameAlpha = p;
		kissAlpha = 0.7 + p * 0.1;
	}

	ctx.fillStyle = "#000000";
	ctx.fillRect(0, 0, W, H);

	const drawDramaticPanel = (img, faceCenter, panelX, panelW, facingRight, panOffset) => {
		ctx.save();
		ctx.beginPath();
		ctx.rect(panelX, 0, panelW, H);
		ctx.clip();

		const srcFaceX = faceCenter.cx * img.width;
		const srcFaceY = faceCenter.cy * img.height;

		const drawH = H * zoom;
		const drawW = img.width * (drawH / img.height);

		let destX;
		if (facingRight) {
			destX = panelX + panelW - drawW + (panelW - drawW * (1 - faceCenter.cx)) + panOffset * W;
			destX = panelX - (srcFaceX / img.width) * drawW + panelW * 0.85 + panOffset * W;
		} else {
			destX = panelX - (srcFaceX / img.width) * drawW + panelW * 0.15 - panOffset * W;
		}

		const destY = H / 2 - (srcFaceY / img.height) * drawH + H * 0.05;

		ctx.filter = "contrast(1.1) saturate(0.85)";
		ctx.drawImage(img, destX, destY, drawW, drawH);
		ctx.filter = "none";

		const vigDir = facingRight ? "to right" : "to left";
		const edgeGrad = ctx.createLinearGradient(
			facingRight ? panelX + panelW * 0.5 : panelX,
			0,
			facingRight ? panelX + panelW : panelX + panelW * 0.5,
			0
		);
		edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
		edgeGrad.addColorStop(1, "rgba(0,0,0,0.88)");
		ctx.fillStyle = edgeGrad;
		ctx.fillRect(panelX, 0, panelW, H);

		const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.25);
		topGrad.addColorStop(0, "rgba(0,0,0,0.7)");
		topGrad.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = topGrad;
		ctx.fillRect(panelX, 0, panelW, H);

		const botGrad = ctx.createLinearGradient(0, H * 0.75, 0, H);
		botGrad.addColorStop(0, "rgba(0,0,0,0)");
		botGrad.addColorStop(1, "rgba(0,0,0,0.75)");
		ctx.fillStyle = botGrad;
		ctx.fillRect(panelX, 0, panelW, H);

		ctx.restore();
	};

	drawDramaticPanel(img1, face1, 0, W / 2, true, panOffset);
	drawDramaticPanel(img2, face2, W / 2, W / 2, false, panOffset);

	if (kissAlpha > 0) {
		const kissGlow = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.25);
		kissGlow.addColorStop(0, `rgba(255, 180, 200, ${kissAlpha * 0.55})`);
		kissGlow.addColorStop(0.5, `rgba(255, 100, 140, ${kissAlpha * 0.25})`);
		kissGlow.addColorStop(1, "rgba(255,80,120,0)");
		ctx.fillStyle = kissGlow;
		ctx.fillRect(0, 0, W, H);

		ctx.save();
		ctx.globalAlpha = kissAlpha * 0.85;
		ctx.font = `${Math.floor(H * 0.18)}px serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("💋", W / 2, H * 0.45);
		ctx.restore();

		const sparkCount = 8;
		for (let i = 0; i < sparkCount; i++) {
			const angle = (i / sparkCount) * Math.PI * 2 + progress * 4;
			const r = W * 0.08 + W * 0.04 * Math.sin(progress * 8 + i);
			const sx = W / 2 + Math.cos(angle) * r;
			const sy = H * 0.45 + Math.sin(angle) * r * 0.7;
			ctx.save();
			ctx.globalAlpha = kissAlpha * 0.6 * (0.5 + 0.5 * Math.sin(progress * 6 + i));
			ctx.fillStyle = "#ffb3c6";
			ctx.font = `${10 + i % 3 * 4}px serif`;
			ctx.textAlign = "center";
			ctx.fillText(["✨", "💕", "❤️", "✨"][i % 4], sx, sy);
			ctx.restore();
		}
	}

	if (nameAlpha > 0) {
		ctx.save();
		ctx.globalAlpha = nameAlpha;
		const nameLabel = `${senderName} 💋 ${targetName}`;
		ctx.font = "bold 22px Arial, sans-serif";
		ctx.textAlign = "center";
		ctx.shadowColor = "rgba(255,80,120,1)";
		ctx.shadowBlur = 18;
		ctx.fillStyle = "#ffffff";
		ctx.fillText(nameLabel, W / 2, H - 30);
		ctx.restore();
	}
}

module.exports = {
	config: {
		name: "قبلة",
		aliases: ["kiss"],
		version: "8.0",
		author: "BlackBot",
		countDown: 20,
		role: 0,
		shortDescription: "🤖 فيديو قبلة سينمائي بالذكاء الاصطناعي",
		longDescription: "يولّد فيديو سينمائي درامي يجمع الشخصين في مشهد قبلة بأسلوب الأنيمي مع قصة رومانسية AI",
		category: "fun",
		guide: "{pn} @ذكر أو رد على رسالة"
	},

	onStart: async function ({ message, event }) {
		const tmpDir = path.join(__dirname, `kiss_tmp_${Date.now()}`);
		fs.mkdirSync(tmpDir, { recursive: true });

		try {
			const mention = Object.keys(event.mentions || {});
			let targetID;

			if (event.messageReply) {
				targetID = event.messageReply.senderID;
			} else if (mention.length > 0) {
				targetID = mention[0];
			} else {
				fs.rmSync(tmpDir, { recursive: true, force: true });
				return message.reply("💋 | اذكر شخصاً أو رد على رسالته\nمثال: .قبلة @اسم");
			}

			const senderID = event.senderID;
			const senderName = event.senderName || "شخص";
			const targetName = (event.mentions || {})[targetID] || "آخر";

			await message.reply(`💋 | جاري تجهيز لحظة رومانسية بين ${senderName} و${targetName} بالذكاء الاصطناعي... 🌹`);

			const img1Path = path.join(tmpDir, "img1.jpg");
			const img2Path = path.join(tmpDir, "img2.jpg");

			await Promise.all([
				fetchProfilePic(senderID, img1Path),
				fetchProfilePic(targetID, img2Path)
			]);

			const [box1, box2, desc1, desc2] = await Promise.all([
				detectFace(img1Path),
				detectFace(img2Path),
				captionImage(img1Path),
				captionImage(img2Path)
			]);

			const [img1, img2, aiStory] = await Promise.all([
				loadImage(img1Path),
				loadImage(img2Path),
				generateRomanticStory(senderName, targetName, desc1, desc2)
			]);

			const W = 780, H = 440, FPS = 24;
			const TOTAL_FRAMES = Math.floor(FPS * 5.5);

			for (let f = 0; f < TOTAL_FRAMES; f++) {
				const progress = f / (TOTAL_FRAMES - 1);
				const canvas = createCanvas(W, H);
				const ctx = canvas.getContext("2d");
				drawSplitKissFrame(ctx, img1, img2, box1, box2, W, H, progress, senderName, targetName);
				const framePath = path.join(tmpDir, `frame_${String(f).padStart(4, "0")}.png`);
				fs.writeFileSync(framePath, canvas.toBuffer("image/png"));
			}

			const outputPath = path.join(tmpDir, "kiss_output.mp4");
			execSync(
				`ffmpeg -y -framerate ${FPS} -i "${path.join(tmpDir, "frame_%04d.png")}" ` +
				`-vf "scale=${W}:${H}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${outputPath}"`,
				{ timeout: 90000 }
			);

			const storyText = aiStory ? `\n\n✨ قصة الذكاء الاصطناعي:\n${aiStory}` : "";

			await message.reply({
				body: `💋 | ${senderName} قبّل ${targetName} 💕${storyText}`,
				attachment: fs.createReadStream(outputPath)
			});

		} catch (err) {
			console.error("[قبلة]", err.message || err);
			message.reply("❌ | حدث خطأ أثناء إنشاء الفيديو.");
		} finally {
			setTimeout(() => {
				try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
			}, 60000);
		}
	}
};
