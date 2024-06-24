import React from 'react';

const CTASection: React.FC = () => {
  return (
    <section className="py-20 bg-blue-600 text-white">
      <div className="container mx-auto text-center">
        <h2 className="text-4xl font-bold mb-4">Ready to Supercharge Your Development?</h2>
        <p className="text-xl mb-8">Join thousands of developers who are already using Nova to revolutionize their workflow.</p>
        <form className="max-w-md mx-auto">
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-grow px-4 py-2 rounded-md text-gray-900"
            />
            <button
              type="submit"
              className="bg-white text-blue-600 px-6 py-2 rounded-md font-semibold hover:bg-gray-100 transition duration-300"
            >
              Get Started
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default CTASection;