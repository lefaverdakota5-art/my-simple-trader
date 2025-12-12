import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <h1 className="text-2xl font-bold mb-4">App Installed!</h1>
        <p className="text-muted-foreground mb-6 text-center">
          The app is already installed on your device.
        </p>
        <Button onClick={() => navigate("/")} className="w-full max-w-xs">
          Open App
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-4">Install AI Trader</h1>
      
      {isIOS ? (
        <div className="text-center">
          <p className="text-muted-foreground mb-6">
            To install on iPhone/iPad:
          </p>
          <ol className="text-left space-y-2 mb-6">
            <li>1. Tap the Share button (box with arrow)</li>
            <li>2. Scroll down and tap "Add to Home Screen"</li>
            <li>3. Tap "Add" in the top right</li>
          </ol>
        </div>
      ) : deferredPrompt ? (
        <div className="text-center">
          <p className="text-muted-foreground mb-6">
            Install the app for quick access from your home screen.
          </p>
          <Button onClick={handleInstall} className="w-full max-w-xs">
            Install App
          </Button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-muted-foreground mb-6">
            To install on Android:
          </p>
          <ol className="text-left space-y-2 mb-6">
            <li>1. Tap the menu (three dots) in your browser</li>
            <li>2. Tap "Add to Home screen" or "Install app"</li>
            <li>3. Follow the prompts to install</li>
          </ol>
        </div>
      )}

      <Button variant="outline" onClick={() => navigate("/")} className="mt-4 w-full max-w-xs">
        Back to Login
      </Button>
    </div>
  );
};

export default Install;
