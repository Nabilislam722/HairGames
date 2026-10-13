import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";

import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Profile from "@/pages/Profile";
import Leaderboard from "@/pages/Leaderboard";
import EventRank from "@/pages/EventRank";
import NotFound from "@/pages/NotFound";

import SpaceShooterPage from "@/games/space-shooter/SpaceShooterPage";
import SpaceHuggersPage from "@/games/space-huggers/SpaceHuggersPage";
import FruitNinjaPage from "@/games/fruit-ninja/FruitNinjaPage";
import RacingGamePage from "@/games/racing/RacingGamePage";
import FishingGamePage from "@/games/fishing/FishingGamePage";
import ProofOfPatiencePage from "@/games/proof-of-patience/ProofOfPatiencePage";
import CandyCascadePage from "@/games/candy-cascade/CandyCascadePage";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/game/space_huggers" component={SpaceHuggersPage} />
        <Route path="/game/space_shooter" component={SpaceShooterPage} />
        <Route path="/game/max_fruitninja" component={FruitNinjaPage} />
        <Route path="/game/race_car" component={RacingGamePage} />
        <Route path="/game/fishing_game" component={FishingGamePage} />
        <Route path="/game/proof_of_patience" component={ProofOfPatiencePage} />
        <Route path="/game/candy_cascade" component={CandyCascadePage} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/profile" component={Profile} />
        <Route path="/eventrank" component={EventRank} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}
function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <Router />
    </TooltipProvider>
  );
}

export default App;
