import React from "react";
import { motion } from "framer-motion";
import { FaFileCode, FaSync, FaRocket } from "react-icons/fa";

const steps = [
  {
    title: "Define Your Goal",
    description: "Clearly state what changes you want to make to your codebase.",
    icon: FaFileCode
  },
  {
    title: "Iterate and Refine",
    description: "Nova generates changes and allows you to provide feedback for improvements.",
    icon: FaSync
  },
  {
    title: "Implement Changes",
    description: "Once satisfied, apply the changes directly to your local files.",
    icon: FaRocket
  },
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
              <div className="flex items-center mb-2">
                <step.icon className="text-3xl text-primary-light dark:text-primary-dark mr-3" />
                <h3 className="text-xl font-semibold">{step.title}</h3>
              </div>
              <p>{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
