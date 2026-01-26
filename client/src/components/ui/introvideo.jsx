import { useEffect, useState } from "react";

const INTRO_COOLDOWN = 30 * 1000; // 30 Sec

export default function IntroVideo() {
    const [showVideo, setShowVideo] = useState(false);

    useEffect(() => {
        const lastPlayed = localStorage.getItem("intro_last_played");
        const now = Date.now();

        if (!lastPlayed || now - Number(lastPlayed) > INTRO_COOLDOWN) {
            setShowVideo(true);
            localStorage.setItem("intro_last_played", now.toString());
        }
    }, []);

    if (!showVideo) return null;
    console.log(`Intro will be playing again in ${INTRO_COOLDOWN}ms`)
    return (
        <video
            autoPlay
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-100 pointer-events-none"
            preload="auto"
            onEnded={() => setShowVideo(false)}
        >
            <source src="/intro.webm" type="video/webm" />
        </video>
    );
}
