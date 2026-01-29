// Static map of US area codes to approximate geographic center coordinates
// Used for geo-proximity phone number routing
// Source: NANPA area code assignments, approximate regional centers

export const AREA_CODE_COORDS: Record<string, { lat: number; lng: number }> = {
  // New Jersey
  '201': { lat: 40.886, lng: -74.044 },   // Jersey City / Hackensack
  '551': { lat: 40.886, lng: -74.044 },   // overlay of 201
  '908': { lat: 40.637, lng: -74.521 },   // Elizabeth / Union
  '732': { lat: 40.478, lng: -74.264 },   // New Brunswick / Toms River
  '848': { lat: 40.478, lng: -74.264 },   // overlay of 732
  '609': { lat: 40.218, lng: -74.742 },   // Trenton / Atlantic City
  '856': { lat: 39.871, lng: -75.035 },   // Camden / Vineland
  '973': { lat: 40.870, lng: -74.271 },   // Newark / Morristown
  '862': { lat: 40.870, lng: -74.271 },   // overlay of 973

  // Washington DC
  '202': { lat: 38.907, lng: -77.037 },

  // Connecticut
  '203': { lat: 41.187, lng: -73.196 },   // Bridgeport / New Haven
  '475': { lat: 41.187, lng: -73.196 },   // overlay of 203
  '860': { lat: 41.764, lng: -72.685 },   // Hartford
  '959': { lat: 41.764, lng: -72.685 },   // overlay of 860

  // Alabama
  '205': { lat: 33.521, lng: -86.803 },   // Birmingham
  '659': { lat: 33.521, lng: -86.803 },   // overlay of 205
  '251': { lat: 30.694, lng: -88.043 },   // Mobile
  '256': { lat: 34.730, lng: -86.586 },   // Huntsville
  '334': { lat: 32.361, lng: -86.279 },   // Montgomery
  '938': { lat: 34.730, lng: -86.586 },   // overlay of 256

  // Washington State
  '206': { lat: 47.606, lng: -122.332 },  // Seattle
  '253': { lat: 47.253, lng: -122.444 },  // Tacoma
  '360': { lat: 47.043, lng: -122.900 },  // Olympia / Vancouver
  '425': { lat: 47.614, lng: -122.196 },  // Bellevue / Everett
  '509': { lat: 47.659, lng: -117.426 },  // Spokane
  '564': { lat: 47.043, lng: -122.900 },  // overlay of 360

  // Maine
  '207': { lat: 44.311, lng: -69.780 },

  // Idaho
  '208': { lat: 43.615, lng: -116.202 },
  '986': { lat: 43.615, lng: -116.202 },  // overlay of 208

  // California
  '209': { lat: 37.958, lng: -121.291 },  // Stockton / Modesto
  '210': { lat: 29.424, lng: -98.494 },   // San Antonio (TX - reassigned historical)
  '213': { lat: 34.052, lng: -118.244 },  // Los Angeles
  '279': { lat: 38.582, lng: -121.494 },  // overlay of 916
  '310': { lat: 33.942, lng: -118.408 },  // Beverly Hills / Torrance
  '323': { lat: 34.023, lng: -118.283 },  // Los Angeles
  '341': { lat: 37.805, lng: -122.272 },  // overlay of 510
  '408': { lat: 37.339, lng: -121.895 },  // San Jose
  '415': { lat: 37.775, lng: -122.419 },  // San Francisco
  '424': { lat: 33.942, lng: -118.408 },  // overlay of 310
  '442': { lat: 33.128, lng: -115.948 },  // overlay of 760
  '510': { lat: 37.805, lng: -122.272 },  // Oakland
  '530': { lat: 39.729, lng: -121.854 },  // Chico / Redding
  '559': { lat: 36.747, lng: -119.772 },  // Fresno
  '562': { lat: 33.770, lng: -118.189 },  // Long Beach
  '619': { lat: 32.716, lng: -117.161 },  // San Diego
  '626': { lat: 34.137, lng: -118.125 },  // Pasadena
  '628': { lat: 37.775, lng: -122.419 },  // overlay of 415
  '650': { lat: 37.486, lng: -122.233 },  // Palo Alto / San Mateo
  '657': { lat: 33.836, lng: -117.914 },  // overlay of 714
  '661': { lat: 35.373, lng: -119.019 },  // Bakersfield
  '669': { lat: 37.339, lng: -121.895 },  // overlay of 408
  '707': { lat: 38.440, lng: -122.714 },  // Santa Rosa
  '714': { lat: 33.836, lng: -117.914 },  // Anaheim / Orange
  '747': { lat: 34.181, lng: -118.308 },  // overlay of 818
  '760': { lat: 33.128, lng: -115.948 },  // Palm Springs / Oceanside
  '805': { lat: 34.275, lng: -119.229 },  // Santa Barbara / Ventura
  '818': { lat: 34.181, lng: -118.308 },  // Burbank / Glendale
  '831': { lat: 36.974, lng: -122.030 },  // Santa Cruz / Monterey
  '858': { lat: 32.896, lng: -117.202 },  // San Diego North
  '909': { lat: 34.063, lng: -117.650 },  // Ontario / Pomona
  '916': { lat: 38.582, lng: -121.494 },  // Sacramento
  '925': { lat: 37.902, lng: -122.065 },  // Concord / Walnut Creek
  '949': { lat: 33.617, lng: -117.929 },  // Irvine
  '951': { lat: 33.953, lng: -117.396 },  // Riverside

  // Texas
  '214': { lat: 32.777, lng: -96.797 },   // Dallas
  '254': { lat: 31.549, lng: -97.147 },   // Waco
  '281': { lat: 29.760, lng: -95.370 },   // Houston
  '325': { lat: 32.449, lng: -99.733 },   // Abilene
  '346': { lat: 29.760, lng: -95.370 },   // overlay of 281
  '361': { lat: 27.801, lng: -97.397 },   // Corpus Christi
  '409': { lat: 30.080, lng: -94.127 },   // Beaumont
  '430': { lat: 32.351, lng: -94.712 },   // overlay of 903
  '432': { lat: 31.998, lng: -102.078 },  // Midland / Odessa
  '469': { lat: 32.777, lng: -96.797 },   // overlay of 214
  '512': { lat: 30.267, lng: -97.743 },   // Austin
  '682': { lat: 32.725, lng: -97.321 },   // overlay of 817
  '713': { lat: 29.760, lng: -95.370 },   // Houston
  '737': { lat: 30.267, lng: -97.743 },   // overlay of 512
  '806': { lat: 33.578, lng: -101.846 },  // Lubbock
  '817': { lat: 32.725, lng: -97.321 },   // Fort Worth
  '830': { lat: 29.710, lng: -98.126 },   // New Braunfels
  '832': { lat: 29.760, lng: -95.370 },   // overlay of 713
  '903': { lat: 32.351, lng: -94.712 },   // Tyler
  '915': { lat: 31.762, lng: -106.485 },  // El Paso
  '936': { lat: 30.724, lng: -95.551 },   // Huntsville / Conroe
  '940': { lat: 33.914, lng: -97.133 },   // Denton / Wichita Falls
  '956': { lat: 26.204, lng: -98.230 },   // Laredo / McAllen
  '972': { lat: 32.777, lng: -96.797 },   // overlay of 214/Dallas
  '979': { lat: 30.628, lng: -96.335 },   // Bryan / College Station

  // New York
  '212': { lat: 40.783, lng: -73.971 },   // Manhattan
  '315': { lat: 43.049, lng: -76.148 },   // Syracuse
  '332': { lat: 40.783, lng: -73.971 },   // overlay of 212
  '347': { lat: 40.650, lng: -73.950 },   // overlay of 718
  '516': { lat: 40.757, lng: -73.594 },   // Nassau County
  '518': { lat: 42.653, lng: -73.757 },   // Albany
  '585': { lat: 43.157, lng: -77.616 },   // Rochester
  '607': { lat: 42.099, lng: -76.078 },   // Binghamton
  '631': { lat: 40.789, lng: -73.135 },   // Suffolk County
  '646': { lat: 40.783, lng: -73.971 },   // overlay of 212
  '680': { lat: 43.049, lng: -76.148 },   // overlay of 315
  '716': { lat: 42.887, lng: -78.879 },   // Buffalo
  '718': { lat: 40.650, lng: -73.950 },   // Brooklyn / Queens / Bronx
  '845': { lat: 41.500, lng: -74.010 },   // Poughkeepsie / Middletown
  '914': { lat: 41.034, lng: -73.763 },   // Westchester
  '917': { lat: 40.783, lng: -73.971 },   // NYC overlay
  '929': { lat: 40.650, lng: -73.950 },   // overlay of 718
  '934': { lat: 40.789, lng: -73.135 },   // overlay of 631

  // Florida
  '239': { lat: 26.640, lng: -81.873 },   // Fort Myers / Naples
  '305': { lat: 25.762, lng: -80.192 },   // Miami
  '321': { lat: 28.263, lng: -80.871 },   // Melbourne / Cape Canaveral
  '352': { lat: 29.652, lng: -82.325 },   // Gainesville / Ocala
  '386': { lat: 29.211, lng: -81.023 },   // Daytona Beach
  '407': { lat: 28.538, lng: -81.379 },   // Orlando
  '561': { lat: 26.715, lng: -80.054 },   // West Palm Beach
  '689': { lat: 28.538, lng: -81.379 },   // overlay of 407
  '727': { lat: 27.773, lng: -82.640 },   // St. Petersburg
  '754': { lat: 26.122, lng: -80.137 },   // overlay of 954
  '772': { lat: 27.446, lng: -80.326 },   // Port St. Lucie
  '786': { lat: 25.762, lng: -80.192 },   // overlay of 305
  '813': { lat: 27.951, lng: -82.459 },   // Tampa
  '850': { lat: 30.438, lng: -84.281 },   // Tallahassee / Pensacola
  '863': { lat: 28.039, lng: -81.950 },   // Lakeland
  '904': { lat: 30.332, lng: -81.656 },   // Jacksonville
  '941': { lat: 27.337, lng: -82.531 },   // Sarasota
  '954': { lat: 26.122, lng: -80.137 },   // Fort Lauderdale

  // Illinois
  '217': { lat: 39.798, lng: -89.644 },   // Springfield
  '224': { lat: 42.287, lng: -87.953 },   // overlay of 847
  '309': { lat: 40.694, lng: -89.589 },   // Peoria
  '312': { lat: 41.878, lng: -87.630 },   // Chicago downtown
  '331': { lat: 41.762, lng: -88.147 },   // overlay of 630
  '618': { lat: 38.520, lng: -89.984 },   // S Illinois / E St. Louis
  '630': { lat: 41.762, lng: -88.147 },   // Aurora / Naperville
  '708': { lat: 41.723, lng: -87.713 },   // Chicago suburbs south
  '773': { lat: 41.899, lng: -87.654 },   // Chicago
  '779': { lat: 42.271, lng: -89.094 },   // overlay of 815
  '815': { lat: 42.271, lng: -89.094 },   // Rockford / Joliet
  '847': { lat: 42.287, lng: -87.953 },   // Evanston / Schaumburg
  '872': { lat: 41.878, lng: -87.630 },   // overlay of 312

  // Pennsylvania
  '215': { lat: 40.003, lng: -75.134 },   // Philadelphia
  '267': { lat: 40.003, lng: -75.134 },   // overlay of 215
  '272': { lat: 41.409, lng: -75.662 },   // overlay of 570
  '412': { lat: 40.441, lng: -79.996 },   // Pittsburgh
  '484': { lat: 40.065, lng: -75.519 },   // overlay of 610
  '570': { lat: 41.409, lng: -75.662 },   // Scranton
  '610': { lat: 40.065, lng: -75.519 },   // Reading / Allentown
  '717': { lat: 40.041, lng: -76.306 },   // Harrisburg / Lancaster
  '724': { lat: 40.176, lng: -79.850 },   // SW Pennsylvania
  '814': { lat: 41.124, lng: -77.428 },   // Erie / State College
  '878': { lat: 40.441, lng: -79.996 },   // overlay of 412

  // Ohio
  '216': { lat: 41.500, lng: -81.694 },   // Cleveland
  '220': { lat: 40.103, lng: -82.925 },   // overlay of 740
  '234': { lat: 41.084, lng: -81.519 },   // overlay of 330
  '330': { lat: 41.084, lng: -81.519 },   // Akron
  '380': { lat: 39.961, lng: -82.999 },   // overlay of 614
  '419': { lat: 41.654, lng: -83.536 },   // Toledo
  '440': { lat: 41.483, lng: -81.799 },   // Cleveland suburbs
  '513': { lat: 39.103, lng: -84.512 },   // Cincinnati
  '567': { lat: 41.654, lng: -83.536 },   // overlay of 419
  '614': { lat: 39.961, lng: -82.999 },   // Columbus
  '740': { lat: 40.103, lng: -82.925 },   // SE Ohio
  '937': { lat: 39.759, lng: -84.192 },   // Dayton

  // Virginia
  '276': { lat: 36.986, lng: -82.068 },   // SW Virginia
  '434': { lat: 37.554, lng: -78.827 },   // Charlottesville / Lynchburg
  '540': { lat: 37.271, lng: -79.942 },   // Roanoke
  '571': { lat: 38.843, lng: -77.277 },   // overlay of 703
  '703': { lat: 38.843, lng: -77.277 },   // Northern Virginia
  '757': { lat: 36.847, lng: -76.293 },   // Norfolk / Virginia Beach
  '804': { lat: 37.541, lng: -77.436 },   // Richmond

  // Michigan
  '231': { lat: 44.245, lng: -86.256 },   // Muskegon / Traverse City
  '248': { lat: 42.603, lng: -83.370 },   // Oakland County
  '269': { lat: 42.292, lng: -85.587 },   // Kalamazoo
  '313': { lat: 42.331, lng: -83.046 },   // Detroit
  '517': { lat: 42.732, lng: -84.556 },   // Lansing
  '586': { lat: 42.519, lng: -82.958 },   // Macomb County
  '616': { lat: 42.963, lng: -85.668 },   // Grand Rapids
  '734': { lat: 42.281, lng: -83.748 },   // Ann Arbor
  '810': { lat: 42.971, lng: -83.688 },   // Flint
  '906': { lat: 46.489, lng: -87.669 },   // Upper Peninsula
  '947': { lat: 42.603, lng: -83.370 },   // overlay of 248
  '989': { lat: 43.600, lng: -84.247 },   // Saginaw / Midland

  // Georgia
  '229': { lat: 31.579, lng: -84.156 },   // Albany
  '404': { lat: 33.749, lng: -84.388 },   // Atlanta
  '470': { lat: 33.749, lng: -84.388 },   // overlay of 404
  '478': { lat: 32.837, lng: -83.633 },   // Macon
  '678': { lat: 33.749, lng: -84.388 },   // overlay of 404
  '706': { lat: 33.960, lng: -83.378 },   // Augusta
  '762': { lat: 33.960, lng: -83.378 },   // overlay of 706
  '770': { lat: 33.831, lng: -84.572 },   // Atlanta suburbs
  '912': { lat: 32.076, lng: -81.088 },   // Savannah

  // Massachusetts
  '339': { lat: 42.227, lng: -71.024 },   // overlay of 781
  '351': { lat: 42.519, lng: -70.897 },   // overlay of 978
  '413': { lat: 42.102, lng: -72.590 },   // Springfield
  '508': { lat: 42.062, lng: -71.248 },   // Worcester / Cape Cod
  '617': { lat: 42.360, lng: -71.059 },   // Boston
  '774': { lat: 42.062, lng: -71.248 },   // overlay of 508
  '781': { lat: 42.227, lng: -71.024 },   // Boston suburbs
  '857': { lat: 42.360, lng: -71.059 },   // overlay of 617
  '978': { lat: 42.519, lng: -70.897 },   // Lowell / Salem

  // Maryland
  '240': { lat: 39.014, lng: -77.009 },   // overlay of 301
  '301': { lat: 39.014, lng: -77.009 },   // Silver Spring / Rockville
  '410': { lat: 39.290, lng: -76.612 },   // Baltimore
  '443': { lat: 39.290, lng: -76.612 },   // overlay of 410
  '667': { lat: 39.290, lng: -76.612 },   // overlay of 410

  // North Carolina
  '252': { lat: 35.595, lng: -77.394 },   // Greenville / Rocky Mount
  '336': { lat: 36.073, lng: -79.792 },   // Greensboro / Winston-Salem
  '704': { lat: 35.227, lng: -80.843 },   // Charlotte
  '743': { lat: 36.073, lng: -79.792 },   // overlay of 336
  '828': { lat: 35.595, lng: -82.549 },   // Asheville
  '910': { lat: 35.055, lng: -78.878 },   // Fayetteville
  '919': { lat: 35.780, lng: -78.639 },   // Raleigh
  '980': { lat: 35.227, lng: -80.843 },   // overlay of 704
  '984': { lat: 35.780, lng: -78.639 },   // overlay of 919

  // South Carolina
  '803': { lat: 34.000, lng: -81.035 },   // Columbia
  '843': { lat: 32.777, lng: -79.931 },   // Charleston
  '854': { lat: 34.852, lng: -82.394 },   // overlay of 864
  '864': { lat: 34.852, lng: -82.394 },   // Greenville

  // Tennessee
  '423': { lat: 35.046, lng: -85.309 },   // Chattanooga
  '615': { lat: 36.163, lng: -86.782 },   // Nashville
  '629': { lat: 36.163, lng: -86.782 },   // overlay of 615
  '731': { lat: 35.614, lng: -88.814 },   // Jackson
  '865': { lat: 35.961, lng: -83.921 },   // Knoxville
  '901': { lat: 35.150, lng: -90.049 },   // Memphis
  '931': { lat: 35.384, lng: -86.447 },   // Clarksville

  // Missouri
  '314': { lat: 38.627, lng: -90.199 },   // St. Louis
  '417': { lat: 37.209, lng: -93.292 },   // Springfield
  '573': { lat: 38.577, lng: -92.174 },   // Jefferson City / Columbia
  '636': { lat: 38.592, lng: -90.573 },   // St. Louis suburbs
  '660': { lat: 38.812, lng: -93.736 },   // Sedalia / Marshall
  '816': { lat: 39.100, lng: -94.579 },   // Kansas City
  '975': { lat: 39.100, lng: -94.579 },   // overlay of 816

  // Indiana
  '219': { lat: 41.593, lng: -87.347 },   // Gary / Hammond
  '260': { lat: 41.080, lng: -85.139 },   // Fort Wayne
  '317': { lat: 39.768, lng: -86.158 },   // Indianapolis
  '463': { lat: 39.768, lng: -86.158 },   // overlay of 317
  '574': { lat: 41.677, lng: -86.252 },   // South Bend
  '765': { lat: 40.193, lng: -85.386 },   // Muncie / Lafayette
  '812': { lat: 39.165, lng: -86.527 },   // Bloomington / Evansville

  // Wisconsin
  '262': { lat: 42.958, lng: -88.008 },   // Waukesha / Kenosha
  '274': { lat: 42.958, lng: -88.008 },   // overlay of 262
  '414': { lat: 43.039, lng: -87.907 },   // Milwaukee
  '534': { lat: 43.039, lng: -87.907 },   // overlay of 414
  '608': { lat: 43.073, lng: -89.401 },   // Madison
  '715': { lat: 44.960, lng: -89.630 },   // Wausau / Eau Claire
  '920': { lat: 44.020, lng: -88.542 },   // Green Bay

  // Minnesota
  '218': { lat: 46.787, lng: -92.100 },   // Duluth
  '320': { lat: 45.561, lng: -94.163 },   // St. Cloud
  '507': { lat: 44.023, lng: -92.470 },   // Rochester / Mankato
  '612': { lat: 44.977, lng: -93.265 },   // Minneapolis
  '651': { lat: 44.954, lng: -93.090 },   // St. Paul
  '763': { lat: 45.101, lng: -93.354 },   // Brooklyn Park
  '952': { lat: 44.838, lng: -93.371 },   // Bloomington / Eden Prairie

  // Colorado
  '303': { lat: 39.739, lng: -104.990 },  // Denver
  '719': { lat: 38.834, lng: -104.822 },  // Colorado Springs
  '720': { lat: 39.739, lng: -104.990 },  // overlay of 303
  '970': { lat: 40.559, lng: -105.078 },  // Fort Collins / Grand Junction

  // Arizona
  '480': { lat: 33.418, lng: -111.831 },  // Mesa / Scottsdale
  '520': { lat: 32.222, lng: -110.975 },  // Tucson
  '602': { lat: 33.449, lng: -112.074 },  // Phoenix
  '623': { lat: 33.543, lng: -112.186 },  // Glendale / Peoria
  '928': { lat: 34.540, lng: -112.469 },  // Flagstaff / Prescott

  // Oregon
  '458': { lat: 44.052, lng: -123.087 },  // overlay of 541
  '503': { lat: 45.523, lng: -122.677 },  // Portland
  '541': { lat: 44.052, lng: -123.087 },  // Eugene / Bend
  '971': { lat: 45.523, lng: -122.677 },  // overlay of 503

  // Nevada
  '702': { lat: 36.169, lng: -115.140 },  // Las Vegas
  '725': { lat: 36.169, lng: -115.140 },  // overlay of 702
  '775': { lat: 39.530, lng: -119.814 },  // Reno

  // Iowa
  '319': { lat: 41.661, lng: -91.530 },   // Cedar Rapids / Iowa City
  '515': { lat: 41.586, lng: -93.625 },   // Des Moines
  '563': { lat: 42.500, lng: -90.664 },   // Dubuque / Davenport
  '641': { lat: 42.034, lng: -93.472 },   // Mason City / Ames
  '712': { lat: 42.035, lng: -95.856 },   // Sioux City / Council Bluffs

  // Kansas
  '316': { lat: 37.687, lng: -97.336 },   // Wichita
  '620': { lat: 37.752, lng: -99.319 },   // Dodge City / Hutchinson
  '785': { lat: 39.049, lng: -95.678 },   // Topeka

  // Kentucky
  '270': { lat: 36.987, lng: -86.444 },   // Bowling Green
  '364': { lat: 36.987, lng: -86.444 },   // overlay of 270
  '502': { lat: 38.254, lng: -85.759 },   // Louisville
  '606': { lat: 37.829, lng: -83.263 },   // Ashland / Eastern KY
  '859': { lat: 38.041, lng: -84.504 },   // Lexington

  // Louisiana
  '225': { lat: 30.451, lng: -91.187 },   // Baton Rouge
  '318': { lat: 32.525, lng: -93.750 },   // Shreveport
  '337': { lat: 30.224, lng: -92.020 },   // Lafayette
  '504': { lat: 29.951, lng: -90.072 },   // New Orleans
  '985': { lat: 30.355, lng: -90.067 },   // Houma / Slidell

  // Oklahoma
  '405': { lat: 35.468, lng: -97.521 },   // Oklahoma City
  '539': { lat: 36.154, lng: -95.993 },   // overlay of 918
  '580': { lat: 34.600, lng: -97.970 },   // Lawton / Enid
  '918': { lat: 36.154, lng: -95.993 },   // Tulsa

  // Nebraska
  '308': { lat: 40.926, lng: -100.766 },  // Grand Island / Kearney
  '402': { lat: 41.257, lng: -95.995 },   // Omaha
  '531': { lat: 41.257, lng: -95.995 },   // overlay of 402

  // Mississippi
  '228': { lat: 30.397, lng: -89.092 },   // Gulfport / Biloxi
  '601': { lat: 32.299, lng: -90.185 },   // Jackson
  '662': { lat: 34.258, lng: -89.004 },   // Tupelo / Oxford
  '769': { lat: 32.299, lng: -90.185 },   // overlay of 601

  // Arkansas
  '479': { lat: 36.073, lng: -94.166 },   // Fort Smith / Fayetteville
  '501': { lat: 34.746, lng: -92.290 },   // Little Rock
  '870': { lat: 35.836, lng: -90.674 },   // Jonesboro / Pine Bluff

  // Utah
  '385': { lat: 40.761, lng: -111.891 },  // overlay of 801
  '435': { lat: 40.234, lng: -111.659 },  // Provo area / St. George
  '801': { lat: 40.761, lng: -111.891 },  // Salt Lake City

  // West Virginia
  '304': { lat: 38.350, lng: -81.633 },   // Charleston
  '681': { lat: 38.350, lng: -81.633 },   // overlay of 304

  // New Hampshire
  '603': { lat: 43.208, lng: -71.538 },

  // New Mexico
  '505': { lat: 35.085, lng: -106.651 },  // Albuquerque
  '575': { lat: 32.350, lng: -106.760 },  // Las Cruces

  // Hawaii
  '808': { lat: 21.307, lng: -157.858 },

  // Vermont
  '802': { lat: 44.259, lng: -72.576 },

  // Alaska
  '907': { lat: 61.218, lng: -149.900 },

  // Rhode Island
  '401': { lat: 41.824, lng: -71.413 },

  // Delaware
  '302': { lat: 39.739, lng: -75.540 },

  // Montana
  '406': { lat: 46.588, lng: -112.024 },

  // South Dakota
  '605': { lat: 44.368, lng: -100.350 },

  // North Dakota
  '701': { lat: 46.808, lng: -100.784 },

  // Wyoming
  '307': { lat: 42.833, lng: -106.325 },

  // District of Columbia overlay
  '771': { lat: 38.907, lng: -77.037 },   // overlay of 202
};
