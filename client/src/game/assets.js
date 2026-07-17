export const ASSETS = {};

export function initAssets() {
    if (Object.keys(ASSETS).length > 0)
        return; // Already initialized

    // ==========================================
    // 1. REVERTED: Original Collectible Fish Logic
    // ==========================================
    const fishSprite = new Image();
    fishSprite.crossOrigin = "Anonymous";
    fishSprite.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = fishSprite.width;
        canvas.height = fishSprite.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(fishSprite, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];
        const tolerance = 40; 
        const isBg = (idx) => {
            return Math.abs(data[idx] - bgR) < tolerance &&
                Math.abs(data[idx + 1] - bgG) < tolerance &&
                Math.abs(data[idx + 2] - bgB) < tolerance;
        };
        const stack = [];
        for (let x = 0; x < canvas.width; x++) {
            stack.push([x, 0]);
            stack.push([x, canvas.height - 1]);
        }
        for (let y = 0; y < canvas.height; y++) {
            stack.push([0, y]);
            stack.push([canvas.width - 1, y]);
        }
        const visited = new Uint8Array(canvas.width * canvas.height);
        while (stack.length > 0) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height)
                continue;
            const i = y * canvas.width + x;
            if (visited[i])
                continue;
            visited[i] = 1;
            const idx = i * 4;
            if (isBg(idx)) {
                data[idx + 3] = 0; 
                stack.push([x + 1, y]);
                stack.push([x - 1, y]);
                stack.push([x, y + 1]);
                stack.push([x, y - 1]);
            }
        }
        ctx.putImageData(imgData, 0, 0);
        ASSETS["fish_sprite"] = canvas;
    };
    fishSprite.src = "/fish.png";
    ASSETS["fish_sprite"] = document.createElement("canvas");

    const loadFishAsset = (key, src) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            let bgR = data[0], bgG = data[1], bgB = data[2];
            const tolerance = 60;
            const isBg = (idx) => {
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                return Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)) < tolerance;
            };
            const isBackgroundMask = new Uint8Array(canvas.width * canvas.height);
            const stack = [];
            for (let x = 0; x < canvas.width; x++) {
                if (isBg((x) * 4)) { stack.push(x, 0); isBackgroundMask[x] = 1; }
                if (isBg(((canvas.height - 1) * canvas.width + x) * 4)) { stack.push(x, canvas.height - 1); isBackgroundMask[(canvas.height - 1) * canvas.width + x] = 1; }
            }
            for (let y = 0; y < canvas.height; y++) {
                if (isBg((y * canvas.width) * 4)) { stack.push(0, y); isBackgroundMask[y * canvas.width] = 1; }
                if (isBg((y * canvas.width + canvas.width - 1) * 4)) { stack.push(canvas.width - 1, y); isBackgroundMask[y * canvas.width + canvas.width - 1] = 1; }
            }
            while (stack.length > 0) {
                const y = stack.pop();
                const x = stack.pop();
                const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
                        const i = ny * canvas.width + nx;
                        if (!isBackgroundMask[i]) {
                            if (isBg(i * 4)) {
                                isBackgroundMask[i] = 1;
                                stack.push(nx, ny);
                            }
                        }
                    }
                }
            }
            const newData = new Uint8ClampedArray(data);
            for (let i = 0; i < data.length; i++) { newData[i] = data[i]; }
            
            const errodedMask = new Uint8Array(canvas.width * canvas.height);
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = y * canvas.width + x;
                    errodedMask[i] = isBackgroundMask[i];
                    if (!isBackgroundMask[i]) {
                        if ((x > 0 && isBackgroundMask[i - 1]) || (x < canvas.width - 1 && isBackgroundMask[i + 1]) || (y > 0 && isBackgroundMask[i - canvas.width]) || (y < canvas.height - 1 && isBackgroundMask[i + canvas.width])) {
                            errodedMask[i] = 1; 
                        }
                    }
                }
            }
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = y * canvas.width + x;
                    const idx = i * 4;
                    if (errodedMask[i]) {
                        newData[idx + 3] = 0; 
                    } else {
                        let bgNeighbors = 0;
                        if (x > 0 && errodedMask[i - 1]) bgNeighbors++;
                        if (x < canvas.width - 1 && errodedMask[i + 1]) bgNeighbors++;
                        if (y > 0 && errodedMask[i - canvas.width]) bgNeighbors++;
                        if (y < canvas.height - 1 && errodedMask[i + canvas.width]) bgNeighbors++;
                        if (bgNeighbors > 0) newData[idx + 3] = 160; 
                    }
                }
            }
            
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = y * canvas.width + x;
                    const idx = i * 4;
                    data[idx] = newData[idx]; data[idx + 1] = newData[idx + 1]; data[idx + 2] = newData[idx + 2]; data[idx + 3] = newData[idx + 3];
                    if (data[idx + 3] > 0) {
                        if (x < minX) minX = x; if (y < minY) minY = y;
                        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
            if (minX <= maxX && minY <= maxY) {
                const cropW = maxX - minX + 1;
                const cropH = maxY - minY + 1;
                const croppedCanvas = document.createElement("canvas");
                croppedCanvas.width = cropW; croppedCanvas.height = cropH;
                const croppedCtx = croppedCanvas.getContext("2d");
                croppedCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
                ASSETS[key] = croppedCanvas;
            } else {
                ASSETS[key] = canvas;
            }
        };
        img.onerror = (e) => console.error("Failed to load fish asset:", src, e);
        img.src = src;
        ASSETS[key] = document.createElement("canvas");
    };

    loadFishAsset("fish_red", "/fish_lv1.jpg");
    loadFishAsset("fish_blue", "/fish_lv2.jpg");
    loadFishAsset("fish_yellow", "/fish_lv3.jpg");
    loadFishAsset("fish_purple", "/fish_lv4.jpg");
    loadFishAsset("fish_gold", "/fish_lv5.jpg");


    // ==========================================
    // 2. UPDATED: Bounding Square Bounding Box + Size Controls
    // ==========================================
    const loadPngAsset = (key, src, scale = 2) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;

            // Auto-crop based on transparency
            let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const alpha = data[(y * canvas.width + x) * 4 + 3];
                    if (alpha > 0) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (minX <= maxX && minY <= maxY) {
                const cropW = maxX - minX + 1;
                const cropH = maxY - minY + 1;

                // Force it into a perfect square layout based on its largest dimension
                const maxDim = Math.max(cropW, cropH);
                const finalSquareSize = maxDim * scale;

                const croppedCanvas = document.createElement("canvas");
                croppedCanvas.width = finalSquareSize;
                croppedCanvas.height = finalSquareSize;
                const croppedCtx = croppedCanvas.getContext("2d");

                // Keep crisp edges if scaling up pixel-heavy graphics
                croppedCtx.imageSmoothingEnabled = false;

                // Center the cropped graphic within the scaled square frame
                const destX = ((maxDim - cropW) / 2) * scale;
                const destY = ((maxDim - cropH) / 2) * scale;
                const destW = cropW * scale;
                const destH = cropH * scale;

                croppedCtx.drawImage(canvas, minX, minY, cropW, cropH, destX, destY, destW, destH);
                ASSETS[key] = croppedCanvas;
            } else {
                ASSETS[key] = canvas;
            }
        };
        img.onerror = (e) => console.error("Failed to load PNG asset:", src, e);
        img.src = src;
        ASSETS[key] = document.createElement("canvas");
    };

    // --- Adjust the 3rd parameter numbers below to dynamically fine-tune your sizes! ---
    loadPngAsset("green_fish", "/phisingMail.png", 2.5);   // Standard Enemy (2.5x Size)
    loadPngAsset("crab", "/Hooded.png", 2.5);             // Standard Enemy (2.5x Size)
    loadPngAsset("shark", "/phishingPhone.png", 3.0);      // Mid-tier Enemy (3.0x Size)
    loadPngAsset("pirate", "/SunglassesGuy.png", 4.5);     // Boss 1 (4.5x Giant Size)
    loadPngAsset("kraken", "evilCoin.png", 5.0);           // Boss 2 (5.0x Mega Size)


    // ==========================================
    // 3. RETAINED: Original ASCII Arts for Environment/Player/Icons
    // ==========================================
    const createAsset = (key, palette, sprite) => {
        const w = sprite[0].length;
        const h = sprite.length;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const char = sprite[y][x];
                if (char && char !== "." && char !== " ") {
                    ctx.fillStyle = palette[char] || "#F0F";
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        ASSETS[key] = canvas;
    };

    createAsset("boat", {
        K: "#2c3e50", W: "#ecf0f1", L: "#d35400", D: "#e67e22", S: "#f1c27d", P: "#2980b9", H: "#e74c3c",
    }, [
        "........K.......", "........KW......", "........KWW.....", "......HHHWWW....",
        "......SKSWWWW...", "......PPKWWWWW..", "......PPKWWWWWW.", "........K.......",
        "..KKKKKKKKK.....", ".KLLLLLLLLLK....", "KLDDDDDDDDDLK...", ".KLLLLLLLLLK....",
        "..KKKKKKKKK.....",
    ]);
    createAsset("rock", { K: "#000", G: "#95a5a6", D: "#7f8c8d", L: "#bdc3c7" }, [
        "......KKKK......", "....KKLLLLKK....", "...KLLLLLLLLK...", "..KLLGGGGLLLLK..",
        ".KLLGGGGGGLLLLK.", ".KLGGDDDDGGLLLK.", "KLGGDDKKDDGLLLLK", "KGGDDDDDDDDGGGGK",
        "KGGDDKKKDDDGGGGK", "KGDDDDDDDDDDGGDK", "KGDDDDDDDDDDGGDK", "KDDDDDDDDDDDDGDK",
        ".KDDDDDDDDDDGDK.", "..KDDDDDDDDDDK..", "...KKDDDDDDKK...", ".....KKKKKK.....",
    ]);
    createAsset("coral", { K: "#000", P: "#fd79a8", D: "#e84393", L: "#fab1a0" }, [
        "...KK......KK...", "..KPPK....KPPK..", "..KLDK...KLLPK..", "..KDPK..KLDPPK..",
        "...KDPKKKPPDK...", ".KK.KPPPPPPK.KK.", "KPDK.KPPPPK.KLPK", "KLPKKKDPPDKKKLDK",
        ".KPPPPPPPDPPPPPK", ".KDPPPDPPPPPPDK.", "..KPPDPPPPPPDK..", "...KDPDPDPDDK...",
        "...KDPDPDPPDK...", "....KKKKKKKK....",
    ]);
    createAsset("barrel", { K: "#000", B: "#e1b12c", D: "#c23616", M: "#718093" }, [
        ".....KKKKKK.....", "...KKBBBBBBKK...", "..KBBBBBBBBBBK..", ".KMMMMMMMMMMMMK.",
        "KBBBBBBBBBBBBBBK", "KBBKBBKBBKBBKBBK", "KMMMMMMMMMMMMMMK", "KBBKBBKBBKBBKBBK",
        "KBBBBBBBBBBBBBBK", ".KMMMMMMMMMMMMK.", "..KBBBBBBBBBBK..", "...KKBBBBBBKK...",
        ".....KKKKKK.....",
    ]);
    createAsset("tentacle", { K: "#000", M: "#8e44ad", P: "#9b59b6", S: "#ff9ff3" }, [
        "......KKKK......", ".....KPPPPK.....", "....KPPPPPPK....", "...KPPMMMMPPK...",
        "..KPPMMKKMMPPK..", "..KPMMKSSKMMMK..", "..KPMMKKKKMMPK..", "...KPMMMMMMMPK..",
        "...KPMMKKMMMPK..", "...KPMKSSKMMMK..", "...KPMKKKKMMMK..", "...KPMMMMMMMPK..",
        "...KPMMKKMMMPK..", "...KPMKSSKMMMK..", "...KPMKKKKMMMK..", "...KPMMMMMMMPK..",
        "...KPMMKKMMMPK..", "....KPMKSSKMPK..", "....KPMKKKKMPK..", "....KPMMMMMPPK..",
        "....KPMMKKMMPK..", ".....KPMKSSKPK..", ".....KPMKKKKPK..", ".....KPMMMMMPK..",
        "......KPMMKKPK..", "......KPMKSKPK..", "......KPMKKKPK..", "......KPMMMPPK..",
        ".......KPMKKPK..", ".......KPMKSPK..", ".......KPMKKPK..", ".......KPPMPPK..",
        ".......KKKKKKK..",
    ]);
    createAsset("portal", { K: "#000", L: "#00d2d3", M: "#5f27cd", W: "#fff" }, [
        "........KKKKKKKK........", "......KKLLLLLLLLKK......", ".....KLLMMMMMMMMLLK.....",
        "....KLMMMLLLLLLMMMLK....", "...KLMMLLLLLLLLLLMMLK...", "..KLMMLMMMMMMMMMMLLMLK..",
        "..KLMLMLLLLLLLLLMMLMLK..", ".KLMLLMMLM.....MMLMLLMK.", ".KLMLMLLM.......MLLMLMK.",
        "KLMMLMML.........LMMLMK.", "KLMLMLL...........LLMLK.", "KLMLMLL....WWW....LLMLK.",
        "KLMLMLL...WWWWW...LLMLK.", "KLMLMLL....WWW....LLMLK.", "KLMLMLL...........LLMLK.",
        "KLMMLMML.........LMMLMK.", ".KLMLMLLM.......MLLMLMK.", ".KLMLLMMLM.....MMLMLLMK.",
        "..KLMLMLLLLLLLLLMMLMLK..", "..KLMMLMMMMMMMMMMLLMLK..", "...KLMMLLLLLLLLLLMMLK...",
        "....KLMMMLLLLLLMMMLK....", ".....KLLMMMMMMMMLLK.....", "......KKLLLLLLLLKK......",
        "........KKKKKKKK........",
    ]);
    createAsset("icon_speed", { K: "#000", Y: "#f1c40f", W: "#fff", L: "#f39c12" }, [
        ".......KK.......", "......KYYK......", ".....KYYYYK.....", "....KYYLLYK.....",
        "...KYYYLLYK.....", "..KYYYYLLYYKKK..", ".KYYYYYLLYYYYYK.", "KKKKKKKLLYYYYYK.",
        ".....KYYLLYYYK..", "....KYYYYLYYK...", "...KYYYYYYYK....", "...KYYYYYYK.....",
        "..KYYYYYK.......", "..KYYYK.........", "...KKK..........", "................"
    ]);
    createAsset("icon_net", { K: "#000", W: "#ecf0f1", D: "#bdc3c7", C: "#7f8c8d" }, [
        "................", ".K.K..K..K..K.K.", ".K.K..K..K..K.K.", ".K.K..K..K..K.K.",
        ".KKKKKKKKKKKKKK.", "..K..K..K..K..K.", "..K..K..K..K..K.", "..KKKKKKKKKKKKK.",
        "...K..K..K..K...", "...K..K..K..K...", "...KKKKKKKKKK...", "....K......K....",
        "....KKKKKKKK....", ".....K....K.....", "......KKKK......", "................"
    ]);
    createAsset("icon_shield", { K: "#000", B: "#3498db", L: "#5dade2", W: "#fff" }, [
        "................", "..KKKKKKKKKKKK..", ".KBLLLLLLLLLLBK.", ".KBLLLLWWLLLLBK.",
        ".KBLLLWWWWLLLBK.", ".KBLLLWWWWLLLBK.", ".KBLLLWWWWLLLBK.", ".KBLLLLWWLLLLBK.",
        ".KBBLLLLLLLLBBK.", "..KBBLLLLLLBBK..", "...KBBLLLLBBK...", "....KBBLLBBK....",
        ".....KBBBBK.....", "......KKKK......", "................"
    ]);
}