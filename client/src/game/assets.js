export const ASSETS = {};
export function initAssets() {
    if (Object.keys(ASSETS).length > 0)
        return; // Already initialized
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
        // Use top-left pixel as the background color to remove
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];
        const tolerance = 40; // tolerance for jpeg artifacts or antialiasing
        const isBg = (idx) => {
            return Math.abs(data[idx] - bgR) < tolerance &&
                Math.abs(data[idx + 1] - bgG) < tolerance &&
                Math.abs(data[idx + 2] - bgB) < tolerance;
        };
        // Flood fill from edges
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
                data[idx + 3] = 0; // transparent
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
    // fallback canvas
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
            const corners = [
                [0, 0],
                [canvas.width - 1, 0],
                [0, canvas.height - 1],
                [canvas.width - 1, canvas.height - 1]
            ];
            let bgR = data[0], bgG = data[1], bgB = data[2];
            const tolerance = 60;
            const isBg = (idx) => {
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                // Calculate distance from background corner color
                return Math.sqrt(Math.pow(r - bgR, 2) + Math.pow(g - bgG, 2) + Math.pow(b - bgB, 2)) < tolerance;
            };
            // Mask array keeping track of background
            const isBackgroundMask = new Uint8Array(canvas.width * canvas.height);
            const stack = [];
            // Add all boundary pixels to stack if they match bg
            for (let x = 0; x < canvas.width; x++) {
                if (isBg((x) * 4)) {
                    stack.push(x, 0);
                    isBackgroundMask[x] = 1;
                }
                if (isBg(((canvas.height - 1) * canvas.width + x) * 4)) {
                    stack.push(x, canvas.height - 1);
                    isBackgroundMask[(canvas.height - 1) * canvas.width + x] = 1;
                }
            }
            for (let y = 0; y < canvas.height; y++) {
                if (isBg((y * canvas.width) * 4)) {
                    stack.push(0, y);
                    isBackgroundMask[y * canvas.width] = 1;
                }
                if (isBg((y * canvas.width + canvas.width - 1) * 4)) {
                    stack.push(canvas.width - 1, y);
                    isBackgroundMask[y * canvas.width + canvas.width - 1] = 1;
                }
            }
            while (stack.length > 0) {
                const y = stack.pop();
                const x = stack.pop();
                const neighbors = [
                    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
                ];
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
            for (let i = 0; i < data.length; i++) {
                newData[i] = data[i];
            }
            // Erode the non-background area safely (dilate background mask) to remove all edge halos
            const errodedMask = new Uint8Array(canvas.width * canvas.height);
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = y * canvas.width + x;
                    errodedMask[i] = isBackgroundMask[i];
                    if (!isBackgroundMask[i]) {
                        if ((x > 0 && isBackgroundMask[i - 1]) ||
                            (x < canvas.width - 1 && isBackgroundMask[i + 1]) ||
                            (y > 0 && isBackgroundMask[i - canvas.width]) ||
                            (y < canvas.height - 1 && isBackgroundMask[i + canvas.width])) {
                            errodedMask[i] = 1; // It's a border pixel, mark it as background to erode it entirely
                        }
                    }
                }
            }
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = y * canvas.width + x;
                    const idx = i * 4;
                    if (errodedMask[i]) {
                        newData[idx + 3] = 0; // Transparent background
                    }
                    else {
                        // Edge smoothing logic on the *new* boundary
                        let bgNeighbors = 0;
                        if (x > 0 && errodedMask[i - 1])
                            bgNeighbors++;
                        if (x < canvas.width - 1 && errodedMask[i + 1])
                            bgNeighbors++;
                        if (y > 0 && errodedMask[i - canvas.width])
                            bgNeighbors++;
                        if (y < canvas.height - 1 && errodedMask[i + canvas.width])
                            bgNeighbors++;
                        if (bgNeighbors > 0) {
                            newData[idx + 3] = 160; // soften edge
                        }
                    }
                }
            }
            // Second pass, remove isolated non-background pixels (noise) or white pixels near the edge
            let minX = canvas.width;
            let minY = canvas.height;
            let maxX = 0;
            let maxY = 0;
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    const i = y * canvas.width + x;
                    const idx = i * 4;
                    data[idx] = newData[idx];
                    data[idx + 1] = newData[idx + 1];
                    data[idx + 2] = newData[idx + 2];
                    data[idx + 3] = newData[idx + 3];
                    // compute bounding box for auto-crop
                    if (data[idx + 3] > 0) {
                        if (x < minX)
                            minX = x;
                        if (y < minY)
                            minY = y;
                        if (x > maxX)
                            maxX = x;
                        if (y > maxY)
                            maxY = y;
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Auto crop
            if (minX <= maxX && minY <= maxY) {
                const cropW = maxX - minX + 1;
                const cropH = maxY - minY + 1;
                const croppedCanvas = document.createElement("canvas");
                croppedCanvas.width = cropW;
                croppedCanvas.height = cropH;
                const croppedCtx = croppedCanvas.getContext("2d");
                croppedCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
                ASSETS[key] = croppedCanvas;
            }
            else {
                ASSETS[key] = canvas;
            }
        };
        img.onerror = (e) => {
            console.error("Failed to load fish asset:", src, e);
        };
        img.src = src;
        ASSETS[key] = document.createElement("canvas");
    };
    loadFishAsset("fish_red", "/fish_lv1.jpg");
    loadFishAsset("fish_blue", "/fish_lv2.jpg");
    loadFishAsset("fish_yellow", "/fish_lv3.jpg");
    loadFishAsset("fish_purple", "/fish_lv4.jpg");
    loadFishAsset("fish_gold", "/fish_lv5.jpg");
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
        K: "#2c3e50",
        W: "#ecf0f1",
        L: "#d35400",
        D: "#e67e22",
        S: "#f1c27d",
        P: "#2980b9",
        H: "#e74c3c",
    }, [
        "........K.......",
        "........KW......",
        "........KWW.....",
        "......HHHWWW....",
        "......SKSWWWW...",
        "......PPKWWWWW..",
        "......PPKWWWWWW.",
        "........K.......",
        "..KKKKKKKKK.....",
        ".KLLLLLLLLLK....",
        "KLDDDDDDDDDLK...",
        ".KLLLLLLLLLK....",
        "..KKKKKKKKK.....",
    ]);
    createAsset("green_fish", { K: "#000", G: "#2ecc71", D: "#27ae60", W: "#fff", R: "#e74c3c" }, [
        "..........KKK...........",
        "........KG...K..........",
        "......KKGGGGGGKK........",
        ".....KGGGGGGGGGGK.......",
        ".K..KGGGWKGGGGGWWK......",
        "KDK.KGGGKKGGGGGWKKK.....",
        "KDGKKGGGGGGGGGGGGGK.....",
        "KDDGGGGGGGGGGGGGGK...KK.",
        "KDDDDGGGGGGGGGGKGGK.KRRK",
        "KDDDDDDGGGGGGGGKGGK.KRRK",
        "KDDGGGGGGGGGGGGGGK...KK.",
        "KDGKKGGGGGGGGGGGGGK.....",
        "KDK.KGGGWKGGGGGWWK......",
        ".K..KGGGWKGGGGGGWK......",
        ".....KGGGGGGGGGGK.......",
        "......KKGGGGGGKK........",
    ]);
    createAsset("crab", { K: "#000", R: "#e74c3c", D: "#c0392b", W: "#fff" }, [
        "...K........K...",
        "..KRK......KRK..",
        ".KRRRK....KRRRK.",
        "KRRRRD...KDRRRK.",
        "KRKDRK....KRKDRK",
        "K.K..KKKKKK..K.K",
        "....KRRRRRRK....",
        "...KRWKRKWRK....",
        "...KRRRRRRRRK...",
        "..KDRRRRRRRRDK..",
        "..K..K....K..K..",
        ".K...K....K...K.",
    ]);
    createAsset("pirate", { K: "#000", W: "#fff", S: "#95a5a6", D: "#5c2c16", L: "#8b4513" }, [
        "........K...............",
        ".......KWK..............",
        "......KWWWK.............",
        ".....KWWWWWK............",
        "....KWWKWKWWK...........",
        "...KWWWWWWWKWK..........",
        "...KWWWKKKWWKWK.........",
        "...KWWKWWWKWWKWK........",
        "...KWWKWWWKWWWKWK.......",
        "..KWWWWKKKWWWWKWWK......",
        "..KWWWWWWWWWWWKKKKK.....",
        "...KKKKKKKKKKKK.........",
        "........K...............",
        "........K...............",
        "K...KKKKKKKKKK...K......",
        ".KKKLLLLLLLLLLKKK.......",
        ".KDDDDDDDDDDDDDDK.......",
        ".KDDDDLLLLDDDDDDK.......",
        "..KDDDDDDDDDDDDK........",
        "..KDDLLLLLDDDDDK........",
        "...KKKKKKKKKKKK.........",
    ]);
    createAsset("shark", { K: "#000", S: "#bdc3c7", D: "#7f8c8d", W: "#fff" }, [
        "................KKKK....",
        "...............KSSSSK...",
        "..............KSSDDSSK..",
        ".............KSDDSSSSK..",
        ".........KK..KSSDDDDDK..",
        "..K.....KSSKKSSSSSSSSS..",
        ".KSK...KSSSSSSSSSSSSSS.K",
        "KSSSK.KSSSSSSKSSSSSSSSK.",
        "KDDDSKKDDSSSSSKSSSSSSSWK",
        "KDDDDDDDDDDDSSSSSSSSSSWK",
        "KDDDSKKDDDDDDDDDDDSKKKK.",
        ".KDK...KDDDDDDDDDDDDK...",
        "..K.....KKK.KDDDDDDDK...",
        "...........KSDDDDDDK....",
        "...........KSDDDDK......",
        "............KKKK........",
    ]);
    createAsset("rock", { K: "#000", G: "#95a5a6", D: "#7f8c8d", L: "#bdc3c7" }, [
        "......KKKK......",
        "....KKLLLLKK....",
        "...KLLLLLLLLK...",
        "..KLLGGGGLLLLK..",
        ".KLLGGGGGGLLLLK.",
        ".KLGGDDDDGGLLLK.",
        "KLGGDDKKDDGLLLLK",
        "KGGDDDDDDDDGGGGK",
        "KGGDDKKKDDDGGGGK",
        "KGDDDDDDDDDDGGDK",
        "KGDDDDDDDDDDGGDK",
        "KDDDDDDDDDDDDGDK",
        ".KDDDDDDDDDDGDK.",
        "..KDDDDDDDDDDK..",
        "...KKDDDDDDKK...",
        ".....KKKKKK.....",
    ]);
    createAsset("coral", { K: "#000", P: "#fd79a8", D: "#e84393", L: "#fab1a0" }, [
        "...KK......KK...",
        "..KPPK....KPPK..",
        "..KLDK...KLLPK..",
        "..KDPK..KLDPPK..",
        "...KDPKKKPPDK...",
        ".KK.KPPPPPPK.KK.",
        "KPDK.KPPPPK.KLPK",
        "KLPKKKDPPDKKKLDK",
        ".KPPPPPPPDPPPPPK",
        ".KDPPPDPPPPPPDK.",
        "..KPPDPPPPPPDK..",
        "...KDPDPDPDDK...",
        "...KDPDPDPPDK...",
        "....KKKKKKKK....",
    ]);
    createAsset("barrel", { K: "#000", B: "#e1b12c", D: "#c23616", M: "#718093" }, [
        ".....KKKKKK.....",
        "...KKBBBBBBKK...",
        "..KBBBBBBBBBBK..",
        ".KMMMMMMMMMMMMK.",
        "KBBBBBBBBBBBBBBK",
        "KBBKBBKBBKBBKBBK",
        "KMMMMMMMMMMMMMMK",
        "KBBKBBKBBKBBKBBK",
        "KBBBBBBBBBBBBBBK",
        ".KMMMMMMMMMMMMK.",
        "..KBBBBBBBBBBK..",
        "...KKBBBBBBKK...",
        ".....KKKKKK.....",
    ]);
    createAsset("kraken", {
        K: "#000",
        M: "#8e44ad",
        D: "#2c3e50",
        R: "#c0392b",
        W: "#fff",
        P: "#9b59b6",
    }, [
        "...........KKKKKKKKK............",
        "........KKKPPPPPPPPPKKK.........",
        "......KKPPPPPPPPPPPPPPPKK.......",
        ".....KPPPPPPPPPPPPPPPPPPPK......",
        "...KKPPPPPPPPPPPPPPMMPPPPPKK....",
        "..KPPPPPPMPPPPPPPPMMMMPPPPPPK...",
        ".KPPPPPPMMMMPPPPPMMMMMPPPPPPPK..",
        ".KPPPPMMMMMMMMPPMMMMMMMPPPPPPK..",
        ".KPPPMMMKKKMMMMPMMMKKKMMMPPPPK..",
        "KPPPMMMKRRWKMMMKMKRRWKMMMPPPPKK.",
        "KPPPMMMKRRRKMMMKMKRRRKMMMMMMMPK.",
        "KPPPMMMMKKKMMMMKMMMKKKMMMMMMMPK.",
        "KPPPPMMMMMMMMMMKMMMMMMMMMMMMMPK.",
        "KPPPPPMMMMMMMMMMMMMMMMMMMMMPPPK.",
        "KPPPPPPMMMMKMMMMMMKMMMMMMMPPPPK.",
        ".KPPPPPPMMMMKKKKKKMMMMMMPPPPPK..",
        ".KPPPPPPPMMMKKKKKKMMMMPPPPPPPK..",
        "..KKPPPPPPMMMMMMMMMMMPPPPPPKK...",
        "....KKPPPPPPMMMMMMMPPPPPPKK.....",
        "......KKKPPPKKKKKKKPPPKKK.......",
        ".........KKK.......KKK..........",
    ]);
    createAsset("tentacle", { K: "#000", M: "#8e44ad", P: "#9b59b6", S: "#ff9ff3" }, [
        "......KKKK......",
        ".....KPPPPK.....",
        "....KPPPPPPK....",
        "...KPPMMMMPPK...",
        "..KPPMMKKMMPPK..",
        "..KPMMKSSKMMMK..",
        "..KPMMKKKKMMPK..",
        "...KPMMMMMMMPK..",
        "...KPMMKKMMMPK..",
        "...KPMKSSKMMMK..",
        "...KPMKKKKMMMK..",
        "...KPMMMMMMMPK..",
        "...KPMMKKMMMPK..",
        "...KPMKSSKMMMK..",
        "...KPMKKKKMMMK..",
        "...KPMMMMMMMPK..",
        "...KPMMKKMMMPK..",
        "....KPMKSSKMPK..",
        "....KPMKKKKMPK..",
        "....KPMMMMMPPK..",
        "....KPMMKKMMPK..",
        ".....KPMKSSKPK..",
        ".....KPMKKKKPK..",
        ".....KPMMMMMPK..",
        "......KPMMKKPK..",
        "......KPMKSKPK..",
        "......KPMKKKPK..",
        "......KPMMMPPK..",
        ".......KPMKKPK..",
        ".......KPMKSPK..",
        ".......KPMKKPK..",
        ".......KPPMPPK..",
        ".......KKKKKKK..",
    ]);
    createAsset("portal", { K: "#000", L: "#00d2d3", M: "#5f27cd", W: "#fff" }, [
        "........KKKKKKKK........",
        "......KKLLLLLLLLKK......",
        ".....KLLMMMMMMMMLLK.....",
        "....KLMMMLLLLLLMMMLK....",
        "...KLMMLLLLLLLLLLMMLK...",
        "..KLMMLMMMMMMMMMMLLMLK..",
        "..KLMLMLLLLLLLLLMMLMLK..",
        ".KLMLLMMLM.....MMLMLLMK.",
        ".KLMLMLLM.......MLLMLMK.",
        "KLMMLMML.........LMMLMK.",
        "KLMLMLL...........LLMLK.",
        "KLMLMLL....WWW....LLMLK.",
        "KLMLMLL...WWWWW...LLMLK.",
        "KLMLMLL....WWW....LLMLK.",
        "KLMLMLL...........LLMLK.",
        "KLMMLMML.........LMMLMK.",
        ".KLMLMLLM.......MLLMLMK.",
        ".KLMLLMMLM.....MMLMLLMK.",
        "..KLMLMLLLLLLLLLMMLMLK..",
        "..KLMMLMMMMMMMMMMLLMLK..",
        "...KLMMLLLLLLLLLLMMLK...",
        "....KLMMMLLLLLLMMMLK....",
        ".....KLLMMMMMMMMLLK.....",
        "......KKLLLLLLLLKK......",
        "........KKKKKKKK........",
    ]);
    createAsset("icon_speed", { K: "#000", Y: "#f1c40f", W: "#fff", L: "#f39c12" }, [
        ".......KK.......",
        "......KYYK......",
        ".....KYYYYK.....",
        "....KYYLLYK.....",
        "...KYYYLLYK.....",
        "..KYYYYLLYYKKK..",
        ".KYYYYYLLYYYYYK.",
        "KKKKKKKLLYYYYYK.",
        ".....KYYLLYYYK..",
        "....KYYYYLYYK...",
        "...KYYYYYYYK....",
        "...KYYYYYYK.....",
        "..KYYYYYK.......",
        "..KYYYK.........",
        "...KKK..........",
        "................"
    ]);
    createAsset("icon_net", { K: "#000", W: "#ecf0f1", D: "#bdc3c7", C: "#7f8c8d" }, [
        "................",
        ".K.K..K..K..K.K.",
        ".K.K..K..K..K.K.",
        ".K.K..K..K..K.K.",
        ".KKKKKKKKKKKKKK.",
        "..K..K..K..K..K.",
        "..K..K..K..K..K.",
        "..KKKKKKKKKKKKK.",
        "...K..K..K..K...",
        "...K..K..K..K...",
        "...KKKKKKKKKK...",
        "....K......K....",
        "....KKKKKKKK....",
        ".....K....K.....",
        "......KKKK......",
        "................"
    ]);
    createAsset("icon_shield", { K: "#000", B: "#3498db", L: "#5dade2", W: "#fff" }, [
        "................",
        "..KKKKKKKKKKKK..",
        ".KBLLLLLLLLLLBK.",
        ".KBLLLLWWLLLLBK.",
        ".KBLLLWWWWLLLBK.",
        ".KBLLLWWWWLLLBK.",
        ".KBLLLWWWWLLLBK.",
        ".KBLLLLWWLLLLBK.",
        ".KBBLLLLLLLLBBK.",
        "..KBBLLLLLLBBK..",
        "...KBBLLLLBBK...",
        "....KBBLLBBK....",
        ".....KBBBBK.....",
        "......KBBK......",
        ".......KK.......",
        "................"
    ]);
}
