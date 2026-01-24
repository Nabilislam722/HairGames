import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Game from "@/pages/game";
import NotFound from "@/pages/not-found";
import Leaderboard from "./components/Leaderboard";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/game/:id" component={Game} />
        <Route path="/leaderboard" component={Leaderboard}/>
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
