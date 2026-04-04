const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { execSync } = require("child_process");

function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerp(a, b, t) {
        return a + (b - a) * t;
}

function drawSplitFrame(ctx, img1, img2, W, H, progress) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, W, H);

        const phase1End = 0.30;
        const phase2End = 0.70;
        const phase3End = 1.00;

        let p1x, p2x, tilt1, tilt2, zoom1, zoom2, splitX, splitBlend;
        const half = W / 2;

        if (progress <= phase1End) {
                const p = easeInOut(progress / phase1End);
                p1x = half * 0.50 - p * half * 0.05;
                p2x = half * 0.50 + p * half * 0.05;
                tilt1 = p * 0.03;
                tilt2 = -p * 0.03;
                zoom1 = 1.0 + p * 0.05;
                zoom2 = 1.0 + p * 0.05;
                splitX = half;
                splitBlend = 0;
        } else if (progress <= phase2End) {
                const p = easeInOut((progress - phase1End) / (phase2End - phase1End));
                p1x = half * 0.50 - 0.05 * half + p * half * 0.40;
                p2x = half * 0.50 + 0.05 * half - p * half * 0.40;
                tilt1 = 0.03 + p * 0.22;
                tilt2 = -(0.03 + p * 0.22);
                zoom1 = 1.05 + p * 0.25;
                zoom2 = 1.05 + p * 0.25;
                splitX = half - p * half * 0.35;
                splitBlend = p * 0.5;
        } else {
                const p = easeInOut((progress - phase2End) / (phase3End - phase2End));
                p1x = half * 0.85 + p * half * 0.05;
                p2x = half * 0.15 - p * half * 0.05;
                tilt1 = 0.25 + p * 0.08;
                tilt2 = -(0.25 + p * 0.08);
                zoom1 = 1.30 + p * 0.10;
                zoom2 = 1.30 + p * 0.10;
                splitX = half - 0.35 * half - p * half * 0.20;
                splitBlend = 0.5 + p * 0.5;
        }

        const faceH = H * 1.05;
        const faceW1 = faceH * (img1.width / img1.height) * zoom1;
        const faceW2 = faceH * (img2.width / img2.height) * zoom2;

        const leftX = p1x - faceW1 * 0.5;
        const rightX = W - p2x - faceW2 * 0.5;
        const imgY = (H - faceH) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitX, H);
        ctx.clip();
        ctx.drawImage(img1, leftX, imgY, faceW1, faceH);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(splitX, 0, W - splitX, H);
        ctx.clip();
        ctx.drawImage(img2, rightX, imgY, faceW2, faceH);
        ctx.restore();

        if (splitBlend > 0) {
                const overlapW = Math.max(0, (p1x + faceW1 * 0.4) - (W - p2x - faceW2 * 0.4));
                if (overlapW > 0) {
                        const overlapStart = W - p2x - faceW2 * 0.4;
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(overlapStart, 0, overlapW, H);
                        ctx.clip();
                        ctx.globalAlpha = splitBlend * 0.6;
                        ctx.drawImage(img1, leftX, imgY, faceW1, faceH);
                        ctx.restore();
                }
        }

        const lineAlpha = Math.max(0, 1.0 - splitBlend * 2.5);
        if (lineAlpha > 0.02) {
                const lineGrad = ctx.createLinearGradient(splitX - 2, 0, splitX + 2, 0);
                lineGrad.addColorStop(0, `rgba(180,180,220,${lineAlpha * 0.0})`);
                lineGrad.addColorStop(0.5, `rgba(220,220,255,${lineAlpha * 0.6})`);
                lineGrad.addColorStop(1, `rgba(180,180,220,${lineAlpha * 0.0})`);
                ctx.fillStyle = lineGrad;
                ctx.fillRect(splitX - 2, 0, 4, H);
        }

        if (progress > 0.60) {
                const heartAmt = (progress - 0.60) / 0.40;
                const centerX = lerp(half, splitX + 10, heartAmt);
                const numHearts = Math.floor(heartAmt * 6);
                for (let i = 0; i < numHearts; i++) {
                        const hx = centerX + (Math.sin(i * 2.1) * 80) + Math.sin(progress * 8 + i) * 15;
                        const hy = H * 0.10 + (i * 28) + Math.sin(progress * 5 + i) * 12;
                        const hSize = 10 + i * 3;
                        ctx.save();
                        ctx.globalAlpha = Math.min(1, heartAmt) * (0.5 + 0.5 * Math.sin(progress * 10 + i));
                        ctx.fillStyle = "#ff4d94";
                        ctx.font = `${hSize}px serif`;
                        ctx.fillText("♥", hx, hy % (H * 0.85));
                        ctx.restore();
                }
        }

        if (progress > 0.55) {
                const vigAmt = (progress - 0.55) / 0.45;
                const vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75);
                vigGrad.addColorStop(0, "rgba(0,0,0,0)");
                vigGrad.addColorStop(1, `rgba(0,0,0,${vigAmt * 0.45})`);
                ctx.fillStyle = vigGrad;
                ctx.fillRect(0, 0, W, H);
        }
}

module.exports = {
        config: {
                name: "قبلة",
                aliases: ["kiss"],
                version: "4.0",
                author: "BlackBot",
                countDown: 15,
                role: 0,
                shortDescription: "فيديو قبلة بصور البروفايل",
                longDescription: "ينشئ فيديو MP4 بأسلوب split-screen يجمع صور البروفايل في مشهد قبلة",
                category: "fun",
                guide: "{pn} @ذكر أو رد على رسالة"
        },

        onStart: async function ({ message, event, api }) {
                try {
                        const mention = Object.keys(event.mentions || {});
                        let targetID;

                        if (event.messageReply) {
                                targetID = event.messageReply.senderID;
                        } else if (mention.length > 0) {
                                targetID = mention[0];
                        } else {
                                return message.reply("💋 | اذكر شخصاً أو رد على رسالته\nمثال: .قبلة @اسم");
                        }

                        const senderID = event.senderID;
                        await message.reply("⏳ | جاري إنشاء الفيديو...");

                        const pic1Url = `https://graph.facebook.com/${senderID}/picture?width=720&height=720&type=large`;
                        const pic2Url = `https://graph.facebook.com/${targetID}/picture?width=720&height=720&type=large`;

                        const [res1, res2] = await Promise.all([
                                axios.get(pic1Url, { responseType: "arraybuffer", timeout: 12000 }),
                                axios.get(pic2Url, { responseType: "arraybuffer", timeout: 12000 })
                        ]);

                        const tmpDir = path.join(__dirname, `kiss_tmp_${Date.now()}`);
                        fs.mkdirSync(tmpDir, { recursive: true });

                        const img1Path = path.join(tmpDir, "img1.jpg");
                        const img2Path = path.join(tmpDir, "img2.jpg");
                        fs.writeFileSync(img1Path, Buffer.from(res1.data));
                        fs.writeFileSync(img2Path, Buffer.from(res2.data));

                        const img1 = await loadImage(img1Path);
                        const img2 = await loadImage(img2Path);

                        const W = 780, H = 440;
                        const FPS = 24;
                        const DURATION = 5.5;
                        const TOTAL_FRAMES = Math.floor(FPS * DURATION);

                        for (let f = 0; f < TOTAL_FRAMES; f++) {
                                const progress = f / (TOTAL_FRAMES - 1);
                                const canvas = createCanvas(W, H);
                                const ctx = canvas.getContext("2d");
                                drawSplitFrame(ctx, img1, img2, W, H, progress);
                                const framePath = path.join(tmpDir, `frame_${String(f).padStart(4, "0")}.png`);
                                fs.writeFileSync(framePath, canvas.toBuffer("image/png"));
                        }

                        const outputPath = path.join(tmpDir, "kiss_output.mp4");
                        execSync(
                                `ffmpeg -y -framerate ${FPS} -i "${path.join(tmpDir, "frame_%04d.png")}" ` +
                                `-vf "scale=${W}:${H}" ` +
                                `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p ` +
                                `"${outputPath}"`,
                                { timeout: 90000 }
                        );

                        const senderName = event.senderName || senderID;
                        const targetName = (event.mentions || {})[targetID] || targetID;

                        await message.reply({
                                body: `💋 | ${senderName} قبّل ${targetName} 💕`,
                                attachment: fs.createReadStream(outputPath)
                        });

                        setTimeout(() => {
                                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
                        }, 60000);

                } catch (err) {
                        console.error("[قبلة]", err.message || err);
                        message.reply("❌ | حدث خطأ أثناء إنشاء الفيديو.");
                }
        }
};
