import { LoginForm } from '@/components/auth/LoginForm';

export function AuthPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Streaming Slides</h1>
          <p className="text-muted-foreground">
            Create and manage dynamic event slideshows
          </p>
        </div>
        
        <div className="bg-background rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold mb-6 text-center">Sign In</h2>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

