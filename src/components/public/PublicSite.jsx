import { PublicSiteProvider } from '../../context/PublicSiteContext'
import { MenuDataProvider } from '../../context/MenuDataContext'
import Header from './Header'
import Hero from './Hero'
import PopularItems from './PopularItems'
import OurBranches from './OurBranches'
import MenuSection from './MenuSection'
import Footer from './Footer'

export default function PublicSite() {
  return (
    <PublicSiteProvider>
      <MenuDataProvider>
        <div className="min-h-screen flex flex-col bg-white">
          <Header />
          <main className="flex-1">
            <Hero />
            <PopularItems />
            <OurBranches />
            <MenuSection />
          </main>
          <Footer />
        </div>
      </MenuDataProvider>
    </PublicSiteProvider>
  )
}
