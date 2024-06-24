import React from 'react';
import { motion } from 'framer-motion';

const steps = [
  { title: 'Connect', description: 'Link Nova to your development environment' },
  { title: 'Analyze', description: 'Nova analyzes your codebase and project structure' },
  { title: 'Suggest', description: 'Receive AI-powered suggestions and optimizations' },
  { title: 'Implement', description: 'Apply changes with a single click or customize as needed' },
];

const HowItWorks: React.FC = () => {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12">How Nova Works</h2>
        <div className="flex flex-col md:flex-row justify-center items-center space-y-8 md:space-y-0 md:space-x-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              className="bg-white p-6 rounded-lg shadow-md w-full md:w-1/4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className="text-3xl font-bold text-blue-500 mb-2">{index + 1}</div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p>{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;