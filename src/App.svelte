<script>
  import { onMount } from "svelte";
  import Loader from "@/components/Loader.svelte";
  import TopNav from "@/components/TopNav.svelte";
  import HomePage from "@/components/HomePage.svelte";
  import FavoritesPanel from "@/components/FavoritesPanel.svelte";
  import LegacyTabBar from "@/components/LegacyTabBar.svelte";
  import { initKandianApp } from "@/features/kandian/bootstrap.js";

  onMount(() => initKandianApp());
</script>

<Loader />
<TopNav />
<HomePage />
<FavoritesPanel />
<LegacyTabBar />
