import toast from 'react-hot-toast';

export function getHumanAuthErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const code = typeof error === 'string' ? error : error?.code || '';
  const message = typeof error === 'object' && error?.message ? String(error.message) : String(error);

  // Common Firebase Auth code mapping to customer-friendly messages
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (code === 'auth/email-already-in-use' || message.includes('email-already-in-use')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (code === 'auth/weak-password' || message.includes('weak-password') || message.includes('Password should be at least')) {
    return 'Please choose a stronger password with at least 6 characters.';
  }
  if (code === 'auth/invalid-email' || message.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Sign-in popup was closed. Please try again.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup window was blocked by your browser. Please allow popups or use Email sign in.';
  }
  if (code === 'auth/network-request-failed' || message.includes('network')) {
    return 'Network connection problem. Please check your internet connection and try again.';
  }
  if (code === 'auth/too-many-requests' || message.includes('too-many-requests')) {
    return 'Too many login attempts. For security, please wait a moment before trying again.';
  }
  if (code === 'auth/user-disabled') {
    return 'This account is currently disabled. Please reach out to customer support for help.';
  }
  if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed') {
    return 'Google Sign-In is temporarily unavailable in this preview window. Please use Email & Password.';
  }

  // Sanitize any raw technical Firebase errors
  if (message.includes('auth/') || message.includes('Firebase') || message.includes('API key')) {
    return 'Authentication could not be completed. Please check your details and try again.';
  }

  return message || 'Unable to sign in. Please try again.';
}

export function notifySignInSuccess(displayName?: string | null, email?: string | null) {
  const name = displayName?.split(' ')[0] || (email ? email.split('@')[0] : 'there');
  
  toast.success(
    `Welcome back, ${name}! Signed in successfully.`,
    {
      id: 'auth-signin-success',
      duration: 4000,
      icon: '🌿',
    }
  );
}

export function notifySignUpSuccess(displayName?: string | null) {
  const name = displayName ? ` ${displayName.split(' ')[0]}` : '';
  
  toast.success(
    `Welcome to FreshNLocal${name}! Your account was created successfully.`,
    {
      id: 'auth-signup-success',
      duration: 4500,
      icon: '🎉',
    }
  );
}

export function notifySignOutSuccess() {
  toast(
    `Signed out safely. See you again soon!`,
    {
      id: 'auth-signout-success',
      duration: 3500,
      icon: '👋',
    }
  );
}

export function notifyAuthError(error: any) {
  const friendlyMessage = getHumanAuthErrorMessage(error);
  toast.error(friendlyMessage, {
    id: 'auth-error',
    duration: 4500,
  });
  return friendlyMessage;
}
