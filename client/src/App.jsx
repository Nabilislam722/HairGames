import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Game from "@/pages/game";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";
import Leaderboard from "./components/Leaderboard";
import SpaceHuggersGame from "./pages/SpaceHuggersGame";
import RacingGamePage from "./pages/RacingGamePage"

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/game/space_huggers" component={SpaceHuggersGame} />
        <Route path="/game/space_shooter" component={Game} />
        <Route path="/game/race_car" component={RacingGamePage} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/profile" component={Profile} />
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
