import React, { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, useAuth } from '../lib/firebase';
import toast from 'react-hot-toast';
import { ShoppingBag, Bell } from 'lucide-react';

export function AdminNotifier() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const userId = user?.uid;
  const mountedTime = useRef(Date.now());
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!isAdmin || !userId) return;

    let isMounted = true;
    let unsubscribe: (() => void) | undefined;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

    // Request notification permission if needed
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => {
        console.debug('Notifications permission check:', err);
      });
    }

    // We only want to notify for orders created AFTER the component mounts
    const q = query(
      collection(db, 'orders'),
      where('createdAt', '>', mountedTime.current)
    );

    const setupListener = () => {
      if (!isMounted) return;

      try {
        unsubscribe = onSnapshot(q, (snapshot) => {
          if (!isMounted) return;

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
                    icon: '/icon.png',
                  });
                } catch (e) {
                  console.debug("Native notification skipped:", e);
                }
              }

              // Play a simple notification sound using Audio API
              try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                  const context = new AudioCtx();
                  const oscillator = context.createOscillator();
                  const gainNode = context.createGain();
                  
                  oscillator.type = 'sine';
                  oscillator.frequency.setValueAtTime(500, context.currentTime);
                  oscillator.frequency.exponentialRampToValueAtTime(800, context.currentTime + 0.1);
                  
                  gainNode.gain.setValueAtTime(0, context.currentTime);
                  gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.05);
                  gainNode.gain.linearRampToValueAtTime(0, context.currentTime + 0.2);
                  
                  oscillator.connect(gainNode);
                  gainNode.connect(context.destination);
                  
                  oscillator.start(context.currentTime);
                  oscillator.stop(context.currentTime + 0.2);
                }
              } catch (e) {
                console.debug("Audio notification skipped:", e);
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
                  border: '2px solid #00b853',
                  padding: '12px 16px',
                }
              });
            }
          });
        }, (error) => {
          if (!isMounted) return;
          // Ignore normal stream cancellations on tab backgrounding/navigation
          if (error?.code === 'cancelled' || error?.message?.includes('CANCELLED')) {
            return;
          }
          console.debug("Firestore live listener reconnecting:", error?.message);
          if (unsubscribe) {
            try { unsubscribe(); } catch {}
          }
          reconnectTimeout = setTimeout(() => {
            if (isMounted) setupListener();
          }, 5000);
        });
      } catch (err) {
        console.debug("Could not establish live listener:", err);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        try { unsubscribe(); } catch {}
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isAdmin, userId]);

  return null; // This component does not render anything
}
