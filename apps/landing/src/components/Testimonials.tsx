import React from 'react';
import { motion } from 'framer-motion';

const testimonials = [
  { name: 'John Doe', role: 'Senior Developer', quote: 'Nova has significantly improved our team\'s productivity. It\'s like having an AI pair programmer!' },
  { name: 'Jane Smith', role: 'CTO', quote: 'The insights provided by Nova have helped us identify and resolve issues we didn\'t even know existed.' },
  // Add more testimonials as needed
];

const Testimonials: React.FC = () => {
  return (
    <section className="py-20 bg-gray-100">
      <div className="container mx-auto">
        <h2 className="text-4xl font-bold text-center mb-12">What Our Users Say</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              className="bg-white p-6 rounded-lg shadow-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <p className="text-lg mb-4">"{testimonial.quote}"</p>
              <div className="font-semibold">{testimonial.name}</div>
              <div className="text-sm text-gray-600">{testimonial.role}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;