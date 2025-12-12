import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, initializeTraderState } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      toast({
        title: 'Error',
        description: 'PIN must be exactly 4 digits',
        variant: 'destructive',
      });
      return;
    }

    if (!email.includes('@')) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    // Use PIN as password (with padding for security requirements)
    const password = `PIN${pin}Secure!`;

    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) {
        toast({
          title: 'Sign Up Error',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: 'Account created! You can now log in.',
        });
        setIsSignUp(false);
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: 'Login Error',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        navigate('/dashboard');
      }
    }

    setLoading(false);
  };

  return (
    <div className="app-container">
      <h1 className="big-text" style={{ textAlign: 'center', marginBottom: '32px' }}>
        My Trader
      </h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
            Email
          </label>
          <input
            type="email"
            className="plain-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
            4-Digit PIN
          </label>
          <input
            type="password"
            className="plain-input"
            value={pin}
            onChange={(e) => setPin(e.target.value.slice(0, 4))}
            placeholder="****"
            maxLength={4}
            inputMode="numeric"
            pattern="[0-9]*"
            required
          />
        </div>

        <button
          type="submit"
          className="plain-button"
          disabled={loading}
          style={{ fontWeight: '600' }}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Login'}
        </button>

        <button
          type="button"
          className="plain-button"
          onClick={() => setIsSignUp(!isSignUp)}
          style={{ marginTop: '8px' }}
        >
          {isSignUp ? 'Already have account? Login' : 'Need account? Sign Up'}
        </button>
      </form>

      <p style={{ marginTop: '32px', textAlign: 'center', color: 'hsl(var(--muted-foreground))' }}>
        Biometric login available on supported devices
      </p>

      <Link
        to="/install"
        style={{
          display: 'block',
          marginTop: '16px',
          textAlign: 'center',
          color: 'hsl(var(--muted-foreground))',
          textDecoration: 'underline',
        }}
      >
        Install App on Phone
      </Link>
    </div>
  );
}