import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="bg-gray-100 py-20">
      <div className="container mx-auto text-center">
        <h2 className="text-4xl font-bold mb-4">Welcome to Our Product</h2>
        <p className="text-xl mb-8">Discover amazing features that will revolutionize your workflow.</p>
        <button className="bg-blue-500 text-white px-6 py-2 rounded-full hover:bg-blue-600">Get Started</button>
      </div>
    </section>
  );
};

export default Hero;