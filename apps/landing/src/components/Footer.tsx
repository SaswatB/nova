import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-white py-12">
      <div className="container mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-xl font-bold mb-4">Nova</h3>
          <p>Revolutionizing development with AI-powered solutions.</p>
        </div>
        <div>
          <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
          <ul className="space-y-2">
            <li><a href="#features" className="hover:text-blue-300">Features</a></li>
            <li><a href="#how-it-works" className="hover:text-blue-300">How It Works</a></li>
            <li><a href="#testimonials" className="hover:text-blue-300">Testimonials</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-lg font-semibold mb-4">Connect With Us</h4>
          <div className="flex space-x-4">
            <a href="#" className="hover:text-blue-300">Twitter</a>
            <a href="#" className="hover:text-blue-300">LinkedIn</a>
            <a href="#" className="hover:text-blue-300">GitHub</a>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center">
        <p>&copy; 2023 Nova. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;