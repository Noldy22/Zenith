import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="w-full bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
      <div className="text-xl font-bold">
        <Link href="/">Zenith</Link>
      </div>
      <div className="flex gap-x-6 text-sm">
        <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">Dashboard</Link>
        <Link href="/charts" className="text-gray-300 hover:text-white transition-colors">Charts</Link>
        <Link href="/settings" className="text-gray-300 hover:text-white transition-colors">Settings</Link>
      </div>
    </nav>
  );
}