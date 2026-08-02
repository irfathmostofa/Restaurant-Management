import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { PublicSiteProvider, usePublicSite } from '../../context/PublicSiteContext'
import { MenuDataProvider } from '../../context/MenuDataContext'
import Header from './Header'
import Hero from './Hero'
import PopularItems from './PopularItems'
import OurBranches from './OurBranches'
import MenuSection from './MenuSection'
import Footer from './Footer'

// When the URL is /branch/:branchId, select that branch and scroll to the
// menu once the branch list has loaded.
function BranchFromUrl() {
  const { branchId } = useParams()
  const { branchesLoaded, branches, selectBranch } = usePublicSite()

  useEffect(() => {
    if (!branchId || !branchesLoaded) return
    if (branches.some((b) => b.id === branchId)) {
      selectBranch(branchId)
      const el = document.getElementById('menu')
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [branchId, branchesLoaded, branches, selectBranch])

  return null
}

export default function PublicSite() {
  return (
    <PublicSiteProvider>
      <MenuDataProvider>
        <BranchFromUrl />
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
