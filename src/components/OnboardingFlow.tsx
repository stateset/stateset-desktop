import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Plug, Zap, ArrowRight, Check, Sparkles, Wrench } from 'lucide-react';
import clsx from 'clsx';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  tips: string[];
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to StateSet',
    description:
      'Your AI-powered agent platform for automating customer service, e-commerce operations, and more.',
    icon: Sparkles,
    tips: [
      'StateSet agents can handle customer inquiries 24/7',
      'Connect to Shopify, Zendesk, and other platforms',
      'Monitor agent performance in real-time',
    ],
  },
  {
    id: 'agents',
    title: 'Create AI Agents',
    description:
      'Agents are autonomous AI assistants that can perform tasks, answer questions, and use tools.',
    icon: Bot,
    tips: [
      'Choose from pre-built templates or create custom agents',
      'Configure behavior with custom instructions',
      'Start, pause, and stop agents anytime',
    ],
  },
  {
    id: 'connections',
    title: 'Connect Your Platforms',
    description: 'Link your e-commerce and support platforms to give agents access to your data.',
    icon: Plug,
    tips: [
      'Secure OAuth authentication for all platforms',
      'Agents can read and write data on your behalf',
      'Manage permissions and access controls',
    ],
  },
  {
    id: 'tools',
    title: 'Powerful Tool Access',
    description: 'Agents can use MCP tools to interact with external services and APIs.',
    icon: Wrench,
    tips: [
      'Process orders and manage inventory',
      'Respond to support tickets automatically',
      'Perform complex multi-step workflows',
    ],
  },
  {
    id: 'ready',
    title: "You're Ready!",
    description: 'Start by creating your first agent or connecting a platform.',
    icon: Zap,
    tips: [
      'Press Ctrl/Cmd+N to create a new agent',
      'Use Ctrl/Cmd+K for the command palette',
      'Press ? to see all keyboard shortcuts',
    ],
  },
];

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
}

export const OnboardingFlow = memo(function OnboardingFlow({
  isOpen,
  onComplete,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const Icon = step.icon;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <motion.div
            className="h-full bg-brand-500"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / ONBOARDING_STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Content */}
        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
                  <Icon className="w-10 h-10 text-white" aria-hidden="true" />
                </div>
              </div>

              {/* Title & Description */}
              <h2 className="text-2xl font-bold text-center mb-3">{step.title}</h2>
              <p className="text-gray-400 text-center mb-6">{step.description}</p>

              {/* Tips */}
              <div className="space-y-3 mb-8">
                {step.tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <div className="w-5 h-5 rounded-full bg-brand-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-brand-400" aria-hidden="true" />
                    </div>
                    <p className="text-sm text-gray-300">{tip}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleSkip}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 rounded"
              aria-label="Skip onboarding tour"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-4">
              {/* Step indicators */}
              <div className="flex items-center gap-1.5">
                {ONBOARDING_STEPS.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={clsx(
                      'w-2 h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1',
                      index === currentStep
                        ? 'bg-brand-500'
                        : index < currentStep
                          ? 'bg-brand-500/50'
                          : 'bg-gray-700'
                    )}
                    aria-label={`Go to step ${index + 1}`}
                    aria-pressed={index === currentStep}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1"
              >
                {isLastStep ? 'Get Started' : 'Next'}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

/**
 * Feature highlight tooltip for introducing new features
 */
interface FeatureHighlightProps {
  isVisible: boolean;
  onDismiss: () => void;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

export const FeatureHighlight = memo(function FeatureHighlight({
  isVisible,
  onDismiss,
  title,
  description,
  position = 'bottom',
  children,
}: FeatureHighlightProps) {
  if (!isVisible) return <>{children}</>;

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  return (
    <div className="relative">
      {children}
      <div
        className={clsx(
          'absolute z-50 w-64 p-4 bg-brand-600 rounded-lg shadow-xl',
          positionClasses[position]
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-semibold text-white">{title}</h4>
          <button
            type="button"
            onClick={onDismiss}
            className="text-white/70 hover:text-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-1 rounded"
            aria-label="Dismiss feature highlight"
          >
            Got it
          </button>
        </div>
        <p className="text-sm text-white/90">{description}</p>
        <div
          className={clsx(
            'absolute w-3 h-3 bg-brand-600 rotate-45',
            position === 'bottom' && 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
            position === 'top' && 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
            position === 'left' && 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
            position === 'right' && 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2'
          )}
        />
      </div>
    </div>
  );
});
