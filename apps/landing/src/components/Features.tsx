import React from 'react';
import { motion } from 'framer-motion';

const featureData = [
  { title: 'AI-Powered Coding', description: 'Leverage AI to write, review, and optimize your code' },
  { title: 'Seamless Integration', description: 'Easily integrate with your existing development workflow' },
  { title: 'Real-time Collaboration', description: 'Work together with your team in real-time' },
  // Add more features as needed
];

const Features: React.FC = () => {
  return (
    <section className="py-20 bg-gray-100">
      <div className="container mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featureData.map((feature, index) => (
            <motion.div
              key={index}
              className="bg-white p-6 rounded-lg shadow-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p>{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;