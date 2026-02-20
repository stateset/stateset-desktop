import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Link2, Zap, CheckCircle2, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface OnboardingProps {
  onComplete: () => void;
}

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: Step[] = [
    {
      id: 'welcome',
      title: 'Welcome to StateSet',
      description: 'Autonomous AI agents for customer service',
      icon: <Sparkles className="w-8 h-8" aria-hidden="true" />,
      content: (
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Bot className="w-12 h-12 text-white" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold mb-4">AI-Powered Customer Service</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            StateSet runs autonomous AI agents that handle your customer service operations 24/7.
            Connect your platforms and let AI do the work.
          </p>
        </div>
      ),
    },
    {
      id: 'connect',
      title: 'Connect Your Platforms',
      description: 'Integrate with Shopify, Gorgias, and more',
      icon: <Link2 className="w-8 h-8" aria-hidden="true" />,
      content: (
        <div className="text-center">
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-8">
            {[
              { name: 'Shopify', color: 'bg-green-900/50' },
              { name: 'Gorgias', color: 'bg-blue-900/50' },
              { name: 'Recharge', color: 'bg-purple-900/50' },
              { name: 'ShipStation', color: 'bg-orange-900/50' },
              { name: 'Zendesk', color: 'bg-teal-900/50' },
              { name: 'Loop', color: 'bg-pink-900/50' },
            ].map((platform) => (
              <div
                key={platform.name}
                className={clsx('p-4 rounded-xl border border-gray-700', platform.color)}
              >
                <span className="text-sm font-medium">{platform.name}</span>
              </div>
            ))}
          </div>
          <h2 className="text-xl font-bold mb-3">One-Click Integrations</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Connect your e-commerce stack with secure OAuth. Your credentials are encrypted and
            never stored on our servers.
          </p>
        </div>
      ),
    },
    {
      id: 'agents',
      title: 'Deploy AI Agents',
      description: 'Specialized agents for every task',
      icon: <Zap className="w-8 h-8" aria-hidden="true" />,
      content: (
        <div className="text-center">
          <div className="space-y-3 max-w-sm mx-auto mb-8">
            {[
              {
                name: 'Response Agent',
                desc: 'Handles support tickets with empathy',
              },
              {
                name: 'Reason Agent',
                desc: 'Analyzes returns and refunds',
              },
              {
                name: 'Subscription Agent',
                desc: 'Manages subscriptions and retention',
              },
            ].map((agent) => (
              <div
                key={agent.name}
                className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center">
                  <Bot className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="text-left">
                  <p className="font-medium">{agent.name}</p>
                  <p className="text-sm text-gray-400">{agent.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-400 max-w-md mx-auto">
            Each agent is specialized for specific tasks and works autonomously around the clock.
          </p>
        </div>
      ),
    },
    {
      id: 'background',
      title: 'Runs in Background',
      description: 'Set it and forget it',
      icon: <CheckCircle2 className="w-8 h-8" aria-hidden="true" />,
      content: (
        <div className="text-center">
          <div className="relative w-48 h-32 mx-auto mb-8">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center">
                <Bot className="w-8 h-8 text-brand-500" aria-hidden="true" />
              </div>
            </div>
            {/* Animated rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full border border-brand-500/30 animate-ping" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-32 h-32 rounded-full border border-brand-500/20 animate-ping"
                style={{ animationDelay: '0.5s' }}
              />
            </div>
          </div>
          <h2 className="text-xl font-bold mb-3">Always On, Always Working</h2>
          <p className="text-gray-400 max-w-md mx-auto mb-4">
            StateSet runs in your system tray and keeps processing tickets even when the window is
            closed. You'll get notifications for important events.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-900/30 text-green-400 rounded-full text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Agents running in background
          </div>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <motion.div
          className="h-full bg-brand-500"
          initial={{ width: 0 }}
          animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Skip button */}
      <div className="absolute top-6 right-6">
        <button
          type="button"
          onClick={handleSkip}
          className="text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded"
          aria-label="Skip onboarding"
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-lg"
          >
            {steps[currentStep].content}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step indicators */}
      <div className="flex justify-center gap-2 mb-6">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => setCurrentStep(index)}
            className={clsx(
              'w-2 h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
              index === currentStep
                ? 'w-8 bg-brand-500'
                : index < currentStep
                  ? 'bg-brand-500/50'
                  : 'bg-gray-700'
            )}
            aria-label={`Go to step ${index + 1}`}
            aria-pressed={index === currentStep}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-6 border-t border-gray-800">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
            currentStep === 0
              ? 'text-gray-600 cursor-not-allowed disabled:focus-visible:ring-0 disabled:focus-visible:ring-offset-0'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          )}
          aria-label={currentStep === 0 ? 'Previous step not available' : 'Go to previous step'}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back
        </button>

        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
          aria-label={isLastStep ? 'Finish onboarding and get started' : 'Go to next step'}
        >
          {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
