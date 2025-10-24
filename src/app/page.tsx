import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  BarChart3,
  BrainCircuit,
  Bot,
  MessageSquare,
  Zap,
  ShieldCheck,
  TrendingUp,
  Target,
  Rocket,
  Layers,
  CheckCircle,
} from 'lucide-react';

// Removed 'next/link' import

export default function HomePage() {
  const features = [
    {
      icon: <BrainCircuit className="w-10 h-10 text-primary mb-4" />,
      title: 'Multi-Timeframe AI Analysis',
      description:
        'Leverages advanced AI to scan multiple timeframes, identifying market structure, liquidity zones, and inefficiencies.',
    },
    {
      icon: <BarChart3 className="w-10 h-10 text-primary mb-4" />,
      title: 'Interactive Chart Visualization',
      description:
        'Visualize AI analysis—order blocks, FVGs, S/D zones—directly overlaid on dynamic, interactive charts.',
    },
    {
      icon: <MessageSquare className="w-10 h-10 text-primary mb-4" />,
      title: 'AI Chat Assistant',
      description:
        'Ask questions in plain English and get instant, context-aware insights about the current market analysis.',
    },
    {
      icon: <Bot className="w-10 h-10 text-primary mb-4" />,
      title: 'Automated Trade Management',
      description:
        'Configure risk parameters and let Zenith manage trades with auto-breakeven, trailing stops, and proactive closing.',
    },
  ];

  const howItWorksSteps = [
    {
      icon: <Layers className="w-8 h-8 text-primary mb-3" />,
      title: 'Connect Your Broker',
      description: 'Securely link your MT5 account via API credentials.',
    },
    {
      icon: <Zap className="w-8 h-8 text-primary mb-3" />,
      title: 'AI Analyzes Markets',
      description: 'Zenith continuously scans selected markets across timeframes.',
    },
    {
      icon: <Target className="w-8 h-8 text-primary mb-3" />,
      title: 'Receive Actionable Insights',
      description: 'Get clear trade suggestions with confidence scores and rationale.',
    },
    {
      icon: <TrendingUp className="w-8 h-8 text-primary mb-3" />,
      title: 'Execute or Automate',
      description: 'Place trades manually or enable auto-trading based on AI signals.',
    },
  ];

  const whyZenithPoints = [
    {
      icon: <CheckCircle className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />,
      title: 'Institutional-Grade Analysis',
      description: 'Access insights previously available only to large funds.',
    },
    {
      icon: <CheckCircle className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />,
      title: 'Data-Driven Decisions',
      description: 'Reduce emotional trading with objective, AI-powered signals.',
    },
    {
      icon: <CheckCircle className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />,
      title: 'Time Efficiency',
      description: 'Let AI do the heavy lifting of market scanning and analysis.',
    },
    {
      icon: <CheckCircle className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" />,
      title: 'Risk Management Tools',
      description: 'Utilize built-in features for automated trade protection.',
    },
  ];

  return (
    // Added overflow-x-hidden to prevent horizontal scroll on small screens
    <main className="flex-grow container mx-auto px-4 py-12 md:py-20 overflow-x-hidden">
      {/* Hero Section */}
      <section className="text-center mb-24 md:mb-32">
        <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary via-amber-500 to-amber-600 leading-tight">
          Your AI-Powered Trading Co-Pilot
        </h1>
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
          Leverage institutional-grade AI analysis to find your edge. Zenith
          scans market structure, liquidity, and inefficiencies, turning
          complex data into actionable insights and trade suggestions.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
          {/* Replaced Link with standard anchor tag */}
          <Button asChild size="lg" className="shadow-lg hover:shadow-primary/50 transition-shadow">
            <a href="/charts">Get Started with Charts</a>
          </Button>
          {/* Replaced Link with standard anchor tag */}
          <Button asChild size="lg" variant="secondary" className="shadow-md">
            <a href="/dashboard">View Dashboard</a>
          </Button>
        </div>
        {/* Optional: Add a subtle graphic or image below the buttons */}
        <div className="mt-16 text-primary animate-pulse">
          {/* Placeholder for a visual element - e.g., an animated chart icon */}
          <BarChart3 size={48} className="mx-auto" />
        </div>
      </section>

      {/* How It Works Section */}
      <section className="mb-24 md:mb-32">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
          How Zenith Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {howItWorksSteps.map((step, index) => (
            <div key={index} className="text-center p-6 bg-secondary/50 rounded-lg shadow-md border border-border hover:border-primary/50 transition-colors duration-300">
              <div className="flex justify-center mb-4">{step.icon}</div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Zenith Section */}
      <section className="mb-24 md:mb-32 bg-secondary rounded-lg p-8 md:p-12 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-primary">
              Why Choose Zenith?
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Gain a competitive advantage with AI insights designed for serious traders. Zenith helps you navigate market complexity with clarity and confidence.
            </p>
            <ul className="space-y-4">
              {whyZenithPoints.map((point, index) => (
                <li key={index} className="flex items-start">
                  {point.icon}
                  <div>
                    <h4 className="font-semibold text-foreground">{point.title}</h4>
                    <p className="text-muted-foreground text-sm">{point.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center items-center p-4">
            {/* Placeholder for an image or illustration */}
            <ShieldCheck size={150} className="text-primary opacity-50" />
            {/* Replace with <img src="/path/to/image.png" alt="Zenith Security" className="rounded-lg shadow-md" /> */}
          </div>
        </div>
      </section>

      {/* Features Section (Reused from original) */}
      <section className="mb-24 md:mb-32">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
          Core Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} className="hover:shadow-lg transition-shadow duration-300 border border-border hover:border-primary/30">
              <CardHeader className="items-center text-center">
                {feature.icon}
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="text-center bg-gradient-to-r from-primary/20 via-background to-background rounded-lg p-12 md:p-20 border border-primary/30 shadow-inner">
        <Rocket className="w-16 h-16 text-primary mx-auto mb-6" />
        <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
          Ready to Elevate Your Trading?
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
          Connect your MT5 account and experience the power of AI-driven market analysis today. Start making more informed decisions.
        </p>
        {/* Replaced Link with standard anchor tag */}
        <Button asChild size="lg" className="shadow-lg hover:shadow-primary/50 transition-shadow">
          <a href="/charts">Explore the Charts</a>
        </Button>
      </section>
    </main>
  );
}

