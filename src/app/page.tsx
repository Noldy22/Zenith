import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { BarChart3, BrainCircuit, Bot, MessageSquare } from 'lucide-react';

export default function HomePage() {
  const features = [
    {
      icon: <BrainCircuit className="w-10 h-10 text-primary mb-4" />,
      title: 'Multi-Timeframe AI Analysis',
      description:
        'Our AI scans multiple timeframes to identify market structure, supply & demand zones, liquidity pools, and more.',
    },
    {
      icon: <BarChart3 className="w-10 h-10 text-primary mb-4" />,
      title: 'Advanced Interactive Charting',
      description:
        'Visualize every part of the AI\'s analysis—from order blocks to fair value gaps—directly on your chart.',
    },
    {
      icon: <MessageSquare className="w-10 h-10 text-primary mb-4" />,
      title: 'AI Chat Assistant',
      description:
        'Ask questions in plain English. Get instant, context-aware answers about the current market analysis.',
    },
    {
      icon: <Bot className="w-10 h-10 text-primary mb-4" />,
      title: 'Automated Trade Management',
      description:
        'Configure your risk and let Zenith manage your trades with features like auto-breakeven and proactive closing.',
    },
  ];

  return (
    // We use flex-grow to ensure the footer is pushed to the bottom
    <main className="flex-grow container mx-auto px-4 py-12 md:py-24">
      {/* Hero Section */}
      <section className="text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-amber-600">
          Your AI-Powered Trading Co-Pilot
        </h1>
        <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
          Leverage institutional-grade AI analysis to find your edge. Zenith
          scans market structure, liquidity, and inefficiencies, turning
          complex data into actionable insights.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/charts">Explore Charts</Link>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="mt-24 md:mt-32">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Discover Your Edge
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                {feature.icon}
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}