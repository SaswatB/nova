import React from "react";

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
        <h1 className="text-5xl md:text-7xl font-bold mb-4">Revolutionize Your Workflow with Nova</h1>
        <p className="text-xl md:text-2xl mb-8">Harness the power of AI to streamline your development process</p>
        <button className="bg-blue-500 text-white px-8 py-3 rounded-full text-lg font-semibold hover:bg-blue-600 transition duration-300">
          Get Started
        </button>
      </div>
    </section>
  );
};

export default Hero;
