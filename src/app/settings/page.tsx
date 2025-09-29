export default function SettingsPage() {
  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 mb-8">
        Settings
      </h1>
      <div className="max-w-lg mx-auto bg-secondary p-8 rounded-xl shadow-2xl text-center">
        <h2 className="text-2xl font-bold mb-4 text-white">Application Settings</h2>
        <p className="text-gray-400">
          Future application settings like theme preferences, notifications, and more will be available here.
        </p>
        <p className="text-gray-400 mt-2">
          MT5 account connection is now managed directly on the Charts page.
        </p>
      </div>
    </main>
  );
}