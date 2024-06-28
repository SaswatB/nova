import React from "react";
import { motion } from "framer-motion";
import { FaRobot, FaDatabase, FaBolt } from "react-icons/fa";

const featureData = [
  {
    title: "AI-Powered Multi-file Editing",
    description:
      "Nova intelligently analyzes your codebase structure, enabling precise changes across multiple files with minimal guidance",
    icon: FaRobot
  },
  {
    title: "Local-First Approach",
    description:
      "All of Nova's changes are done directly on your local file system, allowing immediate access within your preferred IDE",
    icon: FaDatabase
  },
  {
    title: "Lightning-Fast Performance",
    description: "Built for speed with high parallelization, Nova lets you iterate on changes in minutes, not hours",
    icon: FaBolt
  },
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
              <div className="flex items-center mb-4">
                <feature.icon className="text-3xl text-primary-light dark:text-primary-dark mr-3" />
                <h3 className="text-xl font-semibold">{feature.title}</h3>
              </div>
              <p>{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
