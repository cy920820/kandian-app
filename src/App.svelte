<script>
  import { onMount } from "svelte";
  import Loader from "@/components/Loader.svelte";
  import TopNav from "@/components/TopNav.svelte";
  import HomePage from "@/components/HomePage.svelte";
  import FavoritesPanel from "@/components/FavoritesPanel.svelte";
  import LegacyTabBar from "@/components/LegacyTabBar.svelte";
  import { initGlimpseApp } from "@/features/glimpse/bootstrap.js";

  onMount(() => initGlimpseApp());
</script>

<Loader />
<TopNav />
<HomePage />
<FavoritesPanel />
<LegacyTabBar />
