import { Link, useNavigate } from 'react-router-dom'
import {
  Leaf,
  MapPin,
  BarChart3,
  Smartphone,
  Camera,
  Cpu,
  Truck,
  Recycle,
  CheckCircle2
} from 'lucide-react'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
            <Recycle className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-base md:text-lg text-emerald-950 truncate max-w-[150px] sm:max-w-none">Smart E-Waste</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#" className="text-emerald-700">Home</a>
          <a href="#about" className="hover:text-emerald-700 transition-colors">About</a>
          <a href="#features" className="hover:text-emerald-700 transition-colors">Features</a>
          <a href="#contact" className="hover:text-emerald-700 transition-colors">Contact</a>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/auth?role=citizen" className="text-sm font-medium text-slate-600 hover:text-emerald-700">Login</Link>
          <Link to="/auth?role=citizen" className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium rounded-lg shadow-sm transition-all">
            Register
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 md:pt-16 pb-16 md:pb-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="z-10 text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-bold text-emerald-950 leading-[1.15] mb-4 md:mb-6">
              Smart E-Waste<br />Management System
            </h1>
            <p className="text-xl font-medium text-emerald-800 mb-4">
              Efficiently Recycle E-Waste Using AI and IoT
            </p>
            <p className="text-slate-600 mb-8 max-w-lg leading-relaxed">
              Upload photos of your e-waste and our AI system will automatically classify and manage the recycling process.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/auth?role=citizen" className="w-full sm:w-auto px-6 py-3.5 bg-emerald-800 hover:bg-emerald-900 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2">
                Upload E-Waste
              </Link>
              <button className="w-full sm:w-auto px-6 py-3.5 bg-white border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 text-slate-700 font-medium rounded-lg transition-all">
                Learn More
              </button>
            </div>
          </div>
          <div className="relative z-10 flex justify-center">
            {/* We will use a generated image here later, for now a placeholder structure */}
            <div className="relative w-full aspect-square max-w-[500px]">
              <img src="/hero-illustration.png" alt="AI Recycling Illustration" className="w-full h-full object-contain" onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }} />
              <div className="hidden absolute inset-0 bg-emerald-100 rounded-[40px] items-center justify-center text-emerald-800 font-medium">
                Generating Hero Image...
              </div>
            </div>
          </div>
          
          {/* Background decorative elements */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-[800px] h-[800px] bg-emerald-50 rounded-full blur-3xl -z-10 opacity-70"></div>
        </div>
      </section>

      {/* Features Cards */}
      <section id="features" className="py-12 md:py-16 px-4 md:px-8 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {[
            { icon: Cpu, title: 'AI Waste Classification', desc: 'Automatically classify e-waste photos using AI', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { icon: MapPin, title: 'Real-Time Tracking', desc: 'Monitor e-waste collection and bins in real-time.', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { icon: BarChart3, title: 'Data Analytics', desc: 'Gain insights into recycling trends and statistics.', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { icon: Smartphone, title: 'User-Friendly App', desc: 'Easily report and track e-waste from your phone.', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map((feature, idx) => (
            <div key={idx} className="p-8 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow text-center flex flex-col items-center">
              <div className={`w-16 h-16 rounded-full ${feature.bg} flex items-center justify-center mb-6`}>
                <feature.icon className={`w-8 h-8 ${feature.color}`} />
              </div>
              <h3 className="font-bold text-lg text-emerald-950 mb-3">{feature.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 md:py-24 px-4 md:px-8 bg-emerald-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 md:mb-16">How It Works</h2>
          
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-12 md:gap-8 relative">
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-emerald-800/50 -z-10"></div>
            
            {[
              { icon: Camera, title: 'Take Photo\\nof E-Waste', desc: 'Snap a picture of your electronic waste using our app or web portal' },
              { icon: Cpu, title: 'AI Classifies Waste', desc: 'Our AI analyzes and classifies the e-waste into categories: Recyclable, Reusable, Hazardous.' },
              { icon: MapPin, title: 'Track Pickup Status', desc: 'Monitor the status of your e-waste collection and see when it will be picked up' },
              { icon: Truck, title: 'Eco-Friendly Disposal', desc: 'E-waste is collected, processed and sent for recycling in an eco-friendly manner' }
            ].map((step, idx) => (
              <div key={idx} className="flex flex-col items-center text-center relative group">
                <div className="w-24 h-24 rounded-[2rem] bg-white text-emerald-800 flex items-center justify-center mb-6 shadow-xl relative z-10 group-hover:-translate-y-2 transition-transform">
                  <step.icon className="w-10 h-10" />
                </div>
                <h3 className="font-bold text-lg mb-3 whitespace-pre-line">{step.title}</h3>
                <p className="text-emerald-100/80 text-sm leading-relaxed px-4">{step.desc}</p>
                {idx < 3 && <div className="hidden md:block absolute top-12 right-0 translate-x-1/2 w-4 h-4 text-emerald-600/50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 px-4 md:px-8 bg-gradient-to-br from-emerald-50 to-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto bg-emerald-100/50 rounded-[2rem] md:rounded-[40px] p-8 md:p-16 flex flex-col md:flex-row items-center gap-8 md:gap-12 border border-emerald-100/50 relative overflow-hidden">
          <div className="flex-1 relative z-10 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-bold text-emerald-950 mb-4">Start Recycling E-Waste Today!</h2>
            <p className="text-emerald-800/80 text-base md:text-lg mb-8 max-w-lg mx-auto md:mx-0">
              Join our platform and help create a cleaner, greener planet by efficiently disposing of your old electronics.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link to="/auth?role=citizen" className="w-full sm:w-auto px-8 py-4 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold rounded-xl shadow-md transition-all text-center">
                Get Started
              </Link>
              <button className="w-full sm:w-auto px-8 py-4 bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 font-semibold rounded-xl transition-all">
                Learn More
              </button>
            </div>
          </div>
          <div className="flex-1 flex justify-center relative z-10">
            <div className="relative w-full aspect-[4/3] max-w-[500px]">
              <img src="/cta-illustration.png" alt="Recycling process" className="w-full h-full object-contain" onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }} />
              <div className="hidden absolute inset-0 bg-emerald-200/50 rounded-3xl items-center justify-center text-emerald-800 font-medium">
                Generating CTA Image...
              </div>
            </div>
          </div>
          
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-emerald-100/30 to-transparent"></div>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="py-8 text-center text-slate-500 text-sm bg-white border-t border-slate-100">
        <p>&copy; {new Date().getFullYear()} Smart E-Waste Management System. All rights reserved.</p>
      </footer>
    </div>
  )
}
