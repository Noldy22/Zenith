export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-4">
      <div className="text-center">
        <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600">
          Welcome to Zenith
        </h1>
        <p className="mt-4 text-xl text-gray-300 max-w-2xl mx-auto">
          Elevate your trading with our powerful AI-driven platform. Get real-time analysis, automated trading, and deep market insights.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a href="/charts" className="px-8 py-3 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors">
            Go to Charts
          </a>
          <a href="/dashboard" className="px-8 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-colors">
            View Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}