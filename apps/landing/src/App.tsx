import CTASection from "./components/CTASection";
import Features from "./components/Features";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Testimonials from "./components/Testimonials";

function App() {
  return (
    <div className="App">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <CTASection />
      <Footer />
    </div>
  );
}

export default App;
