import React from "react";
import { motion } from "framer-motion";

import { SparklesCore } from "./sparkles";

const Hero: React.FC = () => {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden bg-gray-900 text-white">
      <div className="absolute inset-0 w-full h-full">
        <SparklesCore
          id="tsparticles"
          background="transparent"
          minSize={0.6}
          maxSize={1.4}
          particleDensity={100}
          className="w-full h-full"
          particleColor="#FFFFFF"
        />
      </div>
      <div className="container mx-auto text-center z-10">
        <motion.h1
          className="text-5xl md:text-7xl font-bold mb-4 text-gradient"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Revolutionize Your Development with AI
        </motion.h1>
        <motion.p
          className="text-xl md:text-2xl mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {"50% done your feature in < 10 minutes"}
        </motion.p>
        <motion.button
          className="bg-primary-light dark:bg-primary-dark text-white px-8 py-3 rounded-full text-lg font-semibold hover:bg-opacity-90 transition duration-300"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Get Started
        </motion.button>
      </div>
    </section>
  );
};

export default Hero;
