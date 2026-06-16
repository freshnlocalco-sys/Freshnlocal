import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db, useAuth } from '../lib/firebase';
import { Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface Review {
  id?: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  const fetchReviews = async () => {
    try {
      const q = query(
        collection(db, 'reviews'), 
        where('productId', '==', productId)
      );
      const snapshot = await getDocs(q);
      const fetchedReviews = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      
      // Sort in memory since we might lack index for compound query
      fetchedReviews.sort((a, b) => b.createdAt - a.createdAt);
      
      setReviews(fetchedReviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to submit a review");
      return;
    }
    if (!comment.trim()) {
      toast.error("Please provide a comment");
      return;
    }

    setSubmitting(true);
    try {
      const newReview: Review = {
        productId,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        rating,
        comment: comment.trim(),
        createdAt: Date.now()
      };
      
      await addDoc(collection(db, 'reviews'), newReview);
      toast.success("Review submitted successfully");
      
      setRating(5);
      setComment('');
      fetchReviews();
    } catch (error) {
      console.error("Error submitting review:", error);
      toast.error("Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      toast.success('Review deleted');
      fetchReviews();
    } catch (err) {
      toast.error('Failed to delete review');
      console.error(err);
    }
  };

  const averageRating = reviews.length > 0 
    ? reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length 
    : 0;

  return (
    <div className="mt-20 border-t border-border pt-12">
      <div className="flex flex-col gap-2 mb-10">
        <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">
          Customer Reviews
        </h2>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map(star => (
              <Star 
                key={star} 
                className={`w-5 h-5 ${star <= Math.round(averageRating) ? 'fill-foreground text-foreground' : 'fill-transparent text-border'}`} 
              />
            ))}
          </div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {reviews.length} {reviews.length === 1 ? 'Review' : 'Reviews'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-6">
          {loading ? (
            <div className="animate-pulse flex items-center gap-2">
               <div className="w-4 h-4 bg-border rounded-full"></div>
               <div className="h-2 bg-border rounded w-24"></div>
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-muted-foreground text-xs uppercase tracking-widest font-black py-8 bg-secondary/50 rounded-2xl text-center border border-border">
              No reviews yet. Be the first to share your thoughts!
            </p>
          ) : (
            reviews.map(review => (
              <div key={review.id} className="p-6 bg-secondary border border-border rounded-2xl relative">
                {user && (user.uid === review.userId || user.role === 'admin') && (
                  <button 
                    onClick={() => handleDelete(review.id!)}
                    className="absolute top-6 right-6 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-black text-xs">
                    {review.userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{review.userName}</p>
                    <div className="flex items-center mt-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star 
                          key={star} 
                          className={`w-3 h-3 ${star <= review.rating ? 'fill-foreground text-foreground' : 'fill-transparent text-border'}`} 
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {review.comment}
                </p>
                <div className="text-[9px] text-muted-foreground/50 tracking-widest uppercase font-black mt-4">
                  {new Date(review.createdAt).toLocaleDateString(undefined, { 
                    year: 'numeric', month: 'long', day: 'numeric' 
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-4">
          <div className="bg-secondary border border-border p-6 rounded-2xl sticky top-24">
            <h3 className="text-sm font-black uppercase tracking-widest mb-6">Write a Review</h3>
            
            {user ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Rating</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="focus:outline-none"
                      >
                        <Star 
                          className={`w-8 h-8 transition-colors ${star <= rating ? 'fill-foreground text-foreground drop-shadow-sm' : 'fill-transparent text-muted-foreground hover:fill-foreground/20'}`} 
                        />
                      </button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 mt-6">Your Review</label>
                  <textarea 
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell others what you think about this product..."
                    className="w-full bg-background border border-border rounded-xl p-4 text-xs font-medium focus:border-primary outline-none resize-none transition-colors"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-primary text-white text-[10px] uppercase tracking-widest font-black rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </form>
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-muted-foreground mb-4 font-bold">You need to be logged in to leave a review.</p>
                <Link 
                  to="/profile" 
                  className="inline-block px-6 py-3 bg-primary text-white text-[10px] uppercase tracking-widest font-black rounded-xl hover:bg-primary/90 transition-colors"
                >
                  Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
