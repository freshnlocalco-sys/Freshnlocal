import React, { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, useAuth } from '../lib/firebase';
import toast from 'react-hot-toast';
import { ShoppingBag, Bell } from 'lucide-react';

export function AdminNotifier() {
  const { user } = useAuth();
  const mountedTime = useRef(Date.now());
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(console.error);
    }

    // We only want to notify for orders created AFTER the component mounts
    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>', mountedTime.current)
    );

    let unsubscribe: (() => void) | undefined;
    let reconnectTimeout: NodeJS.Timeout;

    const setupListener = () => {
      unsubscribe = onSnapshot(q, (snapshot) => {
        // Prevent running on initial mount fetch from firestore cache
        if (!initialLoadDone.current) {
          initialLoadDone.current = true;
          snapshot.docChanges(); // flush
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            
            // Browser native notification (works if tab is in background)
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Fresh&Local - New Order!', {
                  body: `Order ${data.orderNumber || ''} for ₹${data.totalAmount || 0} received.`,
                  icon: '/icon.svg', // will use fallback if not found
                });
              } catch (e) {
                console.error("Failed to show native notification", e);
              }
            }

            // Play a simple notification sound using Audio API
            try {
              const context = new (window.AudioContext || (window as any).webkitAudioContext)();
              const oscillator = context.createOscillator();
              const gainNode = context.createGain();
              
              oscillator.type = 'sine';
              oscillator.frequency.setValueAtTime(500, context.currentTime); // 500 Hz
              oscillator.frequency.exponentialRampToValueAtTime(800, context.currentTime + 0.1);
              
              gainNode.gain.setValueAtTime(0, context.currentTime);
              gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.05);
              gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 0.2);
              
              oscillator.connect(gainNode);
              gainNode.connect(context.destination);
              
              oscillator.start(context.currentTime);
              oscillator.stop(context.currentTime + 0.2);
            } catch (e) {
              console.error("Audio playback blocked", e);
            }

            toast((t) => (
              <div className="flex items-center gap-3 w-full">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 animate-pulse" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-extrabold text-[10px] text-foreground uppercase tracking-widest">New Order Placed</span>
                  <span className="text-[9px] font-mono text-muted-foreground">{data.orderNumber} • ₹{data.totalAmount}</span>
                </div>
              </div>
            ), {
              duration: 5000,
              style: {
                background: '#fff',
                border: '2px solid #00b853', // primary color
                padding: '12px 16px',
              }
            });
          }
        });
      }, (error) => {
        console.warn("Firestore listener error (often transient RST_STREAM). Reconnecting in 5s...", error);
        if (unsubscribe) unsubscribe();
        reconnectTimeout = setTimeout(setupListener, 5000);
      });
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
      clearTimeout(reconnectTimeout);
    };
  }, [user]);

  return null; // This component does not render anything
}
