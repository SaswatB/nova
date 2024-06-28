import React from "react";

const Header: React.FC = () => {
  return (
    <header className="bg-white text-gray-800 py-4 shadow-md fixed top-0 left-0 right-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold">Nova</h1>
        <nav>
          <ul className="flex space-x-6">
            {/* <li><a href="#features" className="hover:text-blue-500">Features</a></li>
            <li><a href="#how-it-works" className="hover:text-blue-500">How It Works</a></li>
            <li><a href="#testimonials" className="hover:text-blue-500">Testimonials</a></li> */}
            <li>
              <a href="#cta" className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600">
                Get Started
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;
