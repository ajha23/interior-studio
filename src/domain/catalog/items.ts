import type { CatalogItem } from './types';

/**
 * Standard product catalog items extracted from manufacturer specification catalogs
 * (Hailo, Kesseböhmer, and Modular Systems).
 *
 * Categorized under:
 * - Cabinet Waste Systems
 * - Drawer Inserts & Organizers
 * - Cabinet Drawers & Pull-Outs
 * - Cabinet Flap & Lifter Hardware
 * - Pantry & Tall Storage Units
 * - Electronic Cabinet Hardware
 * - Kitchen Stools & Accessories
 * - Closet & Wardrobe Accessories
 */
export const CATALOG_ITEMS: readonly CatalogItem[] = [
  {
    "asset_id": "HL_CS_450",
    "item_name": "Hailo Cargo Soft Short 450 Waste Separation System (14L + 14L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 418,
      "depth": 332,
      "height": 370,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 450,
        "sides": 16
      }
    },
    "materials_and_finish": {
      "primary_material": "Polypropylene plastic",
      "frame_material": "Powder-coated sheet steel",
      "color_name": "Silver / Light Grey",
      "pbr_roughness_estimate": 0.45,
      "pbr_metalness_estimate": 0.25
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 418x332 with dual internal bin subdivision and slide track guides"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4000-6000 tris",
      "articulations": [
        "drawer_pullout_extension",
        "removable_buckets"
      ]
    },
    "tags": [
      "hailo",
      "waste bin",
      "recycling",
      "under-sink",
      "pull-out",
      "450mm cabinet"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 450,
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_CS_600",
    "item_name": "Hailo Cargo Soft Short 600 Waste Separation System (20L + 10L + 10L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 568,
      "depth": 332,
      "height": 370,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 450,
        "sides": 16
      }
    },
    "materials_and_finish": {
      "primary_material": "Polypropylene plastic",
      "frame_material": "Powder-coated sheet steel",
      "color_name": "Silver / Light Grey",
      "pbr_roughness_estimate": 0.45,
      "pbr_metalness_estimate": 0.25
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 568x332 with triple compartment partition"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "5000-7500 tris",
      "articulations": [
        "drawer_pullout_extension",
        "bucket_lids_open",
        "removable_buckets"
      ]
    },
    "tags": [
      "hailo",
      "waste bin",
      "recycling",
      "600mm cabinet",
      "under-sink",
      "triple bin"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_EC_450",
    "item_name": "Hailo Euro Cargo 450 Waste Separation System (38L + 38L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 418,
      "depth": 528,
      "height": 545,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 550,
        "sides": 16
      }
    },
    "materials_and_finish": {
      "primary_material": "Injection-molded polymer",
      "frame_material": "Dark grey powder-coated steel",
      "color_name": "Dark Grey",
      "pbr_roughness_estimate": 0.5,
      "pbr_metalness_estimate": 0.3
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 418x528 with dual deep bucket layout and heavy-duty over-travel runners"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4500-6500 tris",
      "articulations": [
        "over_travel_extension",
        "removable_buckets"
      ]
    },
    "tags": [
      "hailo",
      "euro cargo",
      "deep drawer",
      "waste bin",
      "dark grey",
      "450mm cabinet"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 450,
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_EC_600",
    "item_name": "Hailo Euro Cargo 600 Waste Separation System (38L + 38L + 12L + 2.5L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 568,
      "depth": 528,
      "height": 545,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 550,
        "sides": 16
      }
    },
    "materials_and_finish": {
      "primary_material": "Injection-molded polymer",
      "frame_material": "Dark grey powder-coated steel",
      "color_name": "Dark Grey",
      "pbr_roughness_estimate": 0.5,
      "pbr_metalness_estimate": 0.3
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 568x528 divided into 4 bucket compartments and top system lid tray"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "6000-8500 tris",
      "articulations": [
        "over_travel_extension",
        "bio_bin_lid_pivot",
        "removable_buckets"
      ]
    },
    "tags": [
      "hailo",
      "euro cargo",
      "recycling center",
      "600mm cabinet",
      "4 buckets",
      "dark grey"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_TD_300",
    "item_name": "Hailo Tandem 300mm Bottom-Mount Pull-Out Waste Bin (15L + 15L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 251,
      "depth": 482,
      "height": 400,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 25
      }
    },
    "materials_and_finish": {
      "primary_material": "Polypropylene plastic",
      "frame_material": "Silver powder-coated steel chassis",
      "color_name": "Dark Grey / Silver",
      "pbr_roughness_estimate": 0.55,
      "pbr_metalness_estimate": 0.2
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Slim rectangle 251x482 with tandem in-line dual bins"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5000 tris",
      "articulations": [
        "full_extension_slide",
        "removable_lids",
        "removable_buckets"
      ]
    },
    "tags": [
      "hailo",
      "tandem",
      "hinged door",
      "narrow cabinet",
      "300mm",
      "bottom mount"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 300,
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_MN_12W",
    "item_name": "Hailo Mono 12 Swivel Waste Bin (12L White)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 290,
      "depth": 304,
      "height": 295,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 350,
        "sides": 100
      }
    },
    "materials_and_finish": {
      "primary_material": "Sheet steel with white enamel finish",
      "frame_material": "White ABS polymer mounting arm and turn-tilt lid",
      "color_name": "Pure White",
      "pbr_roughness_estimate": 0.3,
      "pbr_metalness_estimate": 0.1
    },
    "two_d_representation": {
      "symbol_type": "arc_and_bounding_box",
      "footprint_shape": "Circle diameter 290 with swing-out radius arc and cabinet side bracket"
    },
    "three_d_requirements": {
      "lod_level": "low",
      "polygon_budget_target": "2500-4000 tris",
      "articulations": [
        "door_synchronized_swivel_swing",
        "automatic_tilt_lid"
      ]
    },
    "tags": [
      "hailo",
      "mono 12",
      "swivel bin",
      "swing door",
      "white",
      "under-sink"
    ],
    "vendor": "Hailo",
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_MN_12SS",
    "item_name": "Hailo Mono 12 Stainless Steel Swivel Waste Bin (12L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 290,
      "depth": 304,
      "height": 295,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 350,
        "sides": 100
      }
    },
    "materials_and_finish": {
      "primary_material": "Brushed stainless steel",
      "frame_material": "Black polymer lid and swivel hinge",
      "color_name": "Brushed Inox / Matte Black",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.85
    },
    "two_d_representation": {
      "symbol_type": "arc_and_bounding_box",
      "footprint_shape": "Circle diameter 290 with swing-out radius arc"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3000-4500 tris",
      "articulations": [
        "door_synchronized_swivel_swing",
        "automatic_tilt_lid"
      ]
    },
    "tags": [
      "hailo",
      "mono 12",
      "stainless steel",
      "swivel bin",
      "automatic lid"
    ],
    "vendor": "Hailo",
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_MN_15SS",
    "item_name": "Hailo Mono 15 Stainless Steel Swivel Waste Bin (15L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 290,
      "depth": 304,
      "height": 365,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 350,
        "sides": 100
      }
    },
    "materials_and_finish": {
      "primary_material": "Brushed stainless steel",
      "frame_material": "Black polymer turn-tilt lid and mounting hardware",
      "color_name": "Brushed Inox / Matte Black",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.85
    },
    "two_d_representation": {
      "symbol_type": "arc_and_bounding_box",
      "footprint_shape": "Circle diameter 290 with 304mm projection and door swing arc"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3000-4500 tris",
      "articulations": [
        "door_synchronized_swivel_swing",
        "turn_and_tilt_lid"
      ]
    },
    "tags": [
      "hailo",
      "mono 15",
      "stainless steel",
      "tall swivel bin",
      "15 liter"
    ],
    "vendor": "Hailo",
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_DU_88W",
    "item_name": "Hailo Duo 8/8 Swivel Dual Waste Bin (8L + 8L White)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 388,
      "depth": 203,
      "height": 420,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 450,
        "sides": 150
      }
    },
    "materials_and_finish": {
      "primary_material": "Sheet steel with white coating",
      "frame_material": "White plastic dual-bucket liner and turn-tilt mechanism",
      "color_name": "Pure White",
      "pbr_roughness_estimate": 0.35,
      "pbr_metalness_estimate": 0.15
    },
    "two_d_representation": {
      "symbol_type": "arc_and_bounding_box",
      "footprint_shape": "Oblong rounded rectangle 388x203 with swing radius arc indicator"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5000 tris",
      "articulations": [
        "swivel_door_hinge",
        "automatic_tilt_lid",
        "removable_dual_buckets"
      ]
    },
    "tags": [
      "hailo",
      "duo 8/8",
      "dual bin",
      "white",
      "swing door",
      "recycling"
    ],
    "vendor": "Hailo",
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_DU_88SS",
    "item_name": "Hailo Duo 8/8 Stainless Steel Dual Waste Bin (8L + 8L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Waste Systems"
    },
    "dimensions_mm": {
      "width": 388,
      "depth": 203,
      "height": 420,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 450,
        "sides": 150
      }
    },
    "materials_and_finish": {
      "primary_material": "Fingerprint-resistant stainless steel",
      "frame_material": "Black polymer lid and base rim",
      "color_name": "Brushed Stainless Steel / Black",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.85
    },
    "two_d_representation": {
      "symbol_type": "arc_and_bounding_box",
      "footprint_shape": "Oblong rounded rectangle 388x203 with side-wall pivot point"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5000 tris",
      "articulations": [
        "swivel_door_hinge",
        "automatic_tilt_lid",
        "removable_dual_buckets"
      ]
    },
    "tags": [
      "hailo",
      "duo 8/8",
      "stainless steel",
      "fingerprint-proof",
      "dual bin"
    ],
    "vendor": "Hailo",
    "target_cabinet_type": "base"
  },
  {
    "asset_id": "HL_SEP_600",
    "item_name": "Hailo Separato K 600 In-Drawer Recycling Insert (18L + 8L + 8L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 557,
      "depth": 491,
      "height": 340,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Molded food-grade polypropylene",
      "frame_material": "Structural plastic organizer tray with sidewall tracks",
      "color_name": "Light Grey",
      "pbr_roughness_estimate": 0.55,
      "pbr_metalness_estimate": 0.05
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Compartmentalized grid tray 557x491 with 3 bucket cavities and utility side troughs"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "5000-7000 tris",
      "articulations": [
        "pullout_system_lid_slide",
        "individual_bucket_extraction"
      ]
    },
    "tags": [
      "hailo",
      "separato k",
      "in-drawer",
      "600mm drawer",
      "recycling insert"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "HL_SEP_900",
    "item_name": "Hailo Separato K 900 In-Drawer Recycling Center with Dustpan (18L + 18L + 8L + 8L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 860,
      "depth": 491,
      "height": 340,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Molded polypropylene",
      "frame_material": "Sheet metal system lid and plastic chassis",
      "color_name": "Silver / Light Grey with Red Dustpan Accent",
      "pbr_roughness_estimate": 0.5,
      "pbr_metalness_estimate": 0.15
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Grid rectangle 860x491 with 4 waste buckets, accessory organizer slot, and dustpan nest"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "6500-9000 tris",
      "articulations": [
        "pullout_lid_slide",
        "removable_dustpan",
        "individual_bucket_extraction"
      ]
    },
    "tags": [
      "hailo",
      "separato k",
      "900mm drawer",
      "dustpan and brush",
      "4 bins",
      "in-drawer"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 900,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "HL_GB_400",
    "item_name": "Hailo Grain Box Bottom Mount 400 Bulk Storage Pull-Out (29L + 29L)",
    "category": {
      "primary": "Fixtures",
      "sub": "Pantry & Dry Food Storage"
    },
    "dimensions_mm": {
      "width": 350,
      "depth": 530,
      "height": 523,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 550,
        "sides": 25
      }
    },
    "materials_and_finish": {
      "primary_material": "Airtight food-grade polymer",
      "frame_material": "Powder-coated silver steel pull-out chassis",
      "color_name": "Light Grey / Silver",
      "pbr_roughness_estimate": 0.4,
      "pbr_metalness_estimate": 0.2
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 350x530 with twin hermetic container lids and front bracket"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4500-6000 tris",
      "articulations": [
        "chassis_pullout_extension",
        "container_airtight_lids_open"
      ]
    },
    "tags": [
      "hailo",
      "grain box",
      "flour storage",
      "bulk food",
      "pull-out",
      "400mm cabinet"
    ],
    "vendor": "Hailo",
    "target_cabinet_width_mm": 400,
    "target_cabinet_type": "tall"
  },
  {
    "asset_id": "HL_LIBERO_3",
    "item_name": "Hailo Libero 3.0 Hands-Free Laser Electronic Door Opener",
    "category": {
      "primary": "Fixtures",
      "sub": "Electronic Cabinet Hardware"
    },
    "dimensions_mm": {
      "width": 157,
      "depth": 300,
      "height": 33,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 100,
        "sides": 50
      }
    },
    "materials_and_finish": {
      "primary_material": "Engineered ABS polymer housing",
      "frame_material": "Internal gear motor with friction clutch",
      "color_name": "Off-White / Signal Grey",
      "pbr_roughness_estimate": 0.35,
      "pbr_metalness_estimate": 0.05
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Slim low-profile rectangle 157x300 mounted in cabinet floor routing"
    },
    "three_d_requirements": {
      "lod_level": "low",
      "polygon_budget_target": "1500-2500 tris",
      "articulations": [
        "motorized_push_rod_extension",
        "laser_projection_cone"
      ]
    },
    "tags": [
      "hailo",
      "libero 3.0",
      "electronic opener",
      "laser sensor",
      "alexa voice",
      "hands-free"
    ],
    "vendor": "Hailo"
  },
  {
    "asset_id": "HL_STEPFIX_ANT",
    "item_name": "Hailo Stepfix Folding Plinth Step Stool (Anthracite)",
    "category": {
      "primary": "Furniture",
      "sub": "Kitchen Stools & Ladders"
    },
    "dimensions_mm": {
      "width": 403,
      "depth": 387,
      "height": 380,
      "estimated": false
    },
    "placement": {
      "type": "floor",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 400,
        "sides": 200
      }
    },
    "materials_and_finish": {
      "primary_material": "Ribbed sheet steel steps with anti-slip tread",
      "frame_material": "Powder-coated tubular steel linkage",
      "color_name": "Anthracite RAL 7016",
      "pbr_roughness_estimate": 0.6,
      "pbr_metalness_estimate": 0.4
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Trapezoidal A-frame footprint 403x387 with two tread steps"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5500 tris",
      "articulations": [
        "fold_flat_mechanism",
        "safety_catch_lock"
      ]
    },
    "tags": [
      "hailo",
      "stepfix",
      "step stool",
      "ladder",
      "plinth storage",
      "folding"
    ],
    "vendor": "Hailo"
  },
  {
    "asset_id": "KB_MIO_FP_98",
    "item_name": "Kesseb\u00f6hmer MiO Front Pull-Out Glass Panorama Drawer (98mm)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Drawers & Pull-Outs"
    },
    "dimensions_mm": {
      "width": 600,
      "depth": 503,
      "height": 98,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Tempered clear panorama glass side panels",
      "frame_material": "Powder-coated steel drawer sides and balancePRO runners",
      "color_name": "White 9003 / Anthracite 7500 / Champagne 7039",
      "pbr_roughness_estimate": 0.1,
      "pbr_metalness_estimate": 0.1
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 600x503 with slim double-wall sides and runner brackets"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4000-6000 tris",
      "articulations": [
        "soft_close_drawer_slide",
        "front_clickfixx_quick_release"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "mio",
      "drawer",
      "glass side",
      "shallow drawer",
      "98mm"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_MIO_FP_129",
    "item_name": "Kesseb\u00f6hmer MiO Front Pull-Out Glass Panorama Drawer (129mm)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Drawers & Pull-Outs"
    },
    "dimensions_mm": {
      "width": 600,
      "depth": 503,
      "height": 129,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Tempered clear panorama glass",
      "frame_material": "Powder-coated steel with ClickFixx connectors",
      "color_name": "White 9003 / Anthracite 7500 / Champagne 7039",
      "pbr_roughness_estimate": 0.1,
      "pbr_metalness_estimate": 0.1
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 600x503 with glass side profile markers"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4000-6000 tris",
      "articulations": [
        "soft_close_drawer_slide",
        "3d_front_adjustment"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "mio",
      "mid-height drawer",
      "glass panorama",
      "129mm"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_MIO_FP_167",
    "item_name": "Kesseb\u00f6hmer MiO Front Pull-Out Glass Panorama Deep Drawer (167mm)",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Drawers & Pull-Outs"
    },
    "dimensions_mm": {
      "width": 600,
      "depth": 503,
      "height": 167,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "High-transparency float glass panorama panels",
      "frame_material": "Steel casing and concealed synchronised slides",
      "color_name": "White 9003 / Anthracite 7500 / Champagne 7039",
      "pbr_roughness_estimate": 0.15,
      "pbr_metalness_estimate": 0.2
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Rectangle 600x503 with deep pot/pan base indication"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4500-6500 tris",
      "articulations": [
        "synchronized_runner_slide",
        "tilt_and_gap_adjustment"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "mio",
      "deep drawer",
      "pot drawer",
      "167mm",
      "glass panorama"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_MIO_IN_DRAWER",
    "item_name": "Kesseb\u00f6hmer MiO Internal Glass Front Drawer Set",
    "category": {
      "primary": "Fixtures",
      "sub": "Internal Cabinet Drawers"
    },
    "dimensions_mm": {
      "width": 600,
      "depth": 503,
      "height": 167,
      "estimated": false
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 500,
        "sides": 25
      }
    },
    "materials_and_finish": {
      "primary_material": "Clear glass front fascia and side walls",
      "frame_material": "Powder-coated metal brackets and runners",
      "color_name": "Anthracite 7500 / White 9003",
      "pbr_roughness_estimate": 0.2,
      "pbr_metalness_estimate": 0.25
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Internal inset rectangle with hinge-clearance spacer blocks"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4000-6000 tris",
      "articulations": [
        "internal_runner_extension",
        "integrated_handle_pull"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "mio",
      "internal drawer",
      "pantry pull-out",
      "glass front"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_MIO_CUTLERY",
    "item_name": "Kesseb\u00f6hmer MiO Cutlery Organizer Tray Insert",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 300,
      "depth": 455,
      "height": 98,
      "estimated": false
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Textured velvet-touch polymer",
      "frame_material": "Modular divider grid",
      "color_name": "Slate Grey RAL 7015",
      "pbr_roughness_estimate": 0.7,
      "pbr_metalness_estimate": 0.05
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Compartmentalized grid tray 300x455 with 6 utensil slots"
    },
    "three_d_requirements": {
      "lod_level": "low",
      "polygon_budget_target": "2000-3500 tris",
      "articulations": [
        "removable_dividers"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "mio",
      "cutlery tray",
      "organizer",
      "utensil divider"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_MIO_UNIGRID",
    "item_name": "Kesseb\u00f6hmer MiO uniGRID Plateware Rack and Service Tray System",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 560,
      "depth": 470,
      "height": 180,
      "estimated": true
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "High-grade matte food-safe polymer",
      "frame_material": "Brushed stainless steel carry handles",
      "color_name": "Pure White / Anodized Aluminum",
      "pbr_roughness_estimate": 0.4,
      "pbr_metalness_estimate": 0.3
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Modular slotted plate organizer grid with removable handled tray units"
    },
    "three_d_requirements": {
      "lod_level": "high",
      "polygon_budget_target": "7000-11000 tris",
      "articulations": [
        "service_tray_detachment",
        "vertical_plate_slot_adjustment"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "unigrid",
      "plate rack",
      "service tray",
      "dish drainage"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_MIO_TALL_600",
    "item_name": "Kesseb\u00f6hmer MiO Tall Pantry Unit 5-Drawer Pull-Out System (600mm)",
    "category": {
      "primary": "Fixtures",
      "sub": "Pantry & Tall Storage Units"
    },
    "dimensions_mm": {
      "width": 600,
      "depth": 503,
      "height": 1600,
      "estimated": true
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 600,
        "sides": 20
      }
    },
    "materials_and_finish": {
      "primary_material": "Glass panorama drawers with structural steel casing",
      "frame_material": "Heavy-duty full-extension slides with balancePRO",
      "color_name": "Anthracite 7500 / Glass",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.3
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Tower footprint 600x503 showing stacked internal slide tier indicators"
    },
    "three_d_requirements": {
      "lod_level": "high",
      "polygon_budget_target": "10000-16000 tris",
      "articulations": [
        "individual_5_drawer_pullouts",
        "plate_tray_removable"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "tall unit",
      "pantry tower",
      "5 drawers",
      "panoramic glass"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "tall"
  },
  {
    "asset_id": "KB_MIO_WARDROBE",
    "item_name": "Kesseb\u00f6hmer MiO Wardrobe Glass Panorama Pull-Out Trays",
    "category": {
      "primary": "Furniture",
      "sub": "Closet & Wardrobe Accessories"
    },
    "dimensions_mm": {
      "width": 800,
      "depth": 500,
      "height": 130,
      "estimated": true
    },
    "placement": {
      "type": "embedded",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 550,
        "sides": 18
      }
    },
    "materials_and_finish": {
      "primary_material": "Ultra-narrow profile powder-coated steel sides",
      "frame_material": "Floating clear glass panel fronts",
      "color_name": "Anthracite / Champagne",
      "pbr_roughness_estimate": 0.2,
      "pbr_metalness_estimate": 0.4
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Low-profile wardrobe drawer footprint 800x500 with glass rail"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "4000-6000 tris",
      "articulations": [
        "sliding_tray_extension"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "wardrobe",
      "closet drawer",
      "shirt tray",
      "panorama glass"
    ],
    "vendor": "Kesseb\u00f6hmer"
  },
  {
    "asset_id": "KB_CAN_600_16A",
    "item_name": "Modular Drawer Spice/Grain Canister Matrix (600mm Drawer, 16x 500g)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 510,
      "depth": 470,
      "height": 80,
      "estimated": false
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Brushed stainless steel canisters with clear view lids",
      "frame_material": "CNC wood/acrylic matrix locator plate",
      "color_name": "Natural Birch / Stainless Inox",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.75
    },
    "two_d_representation": {
      "symbol_type": "array_of_circles",
      "footprint_shape": "Rectangle 510x470 with 4x4 array of 16 round canister cutouts"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "6000-9000 tris",
      "articulations": [
        "canisters_individually_removable",
        "canister_lids_open"
      ]
    },
    "tags": [
      "spice rack",
      "canister matrix",
      "500g jars",
      "600mm drawer",
      "pantry storage"
    ],
    "vendor": "Modular Systems",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_CAN_600_16B",
    "item_name": "Modular Drawer Spice/Grain Canister Matrix (600mm Drawer, 16x 1kg)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 510,
      "depth": 470,
      "height": 180,
      "estimated": false
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Brushed stainless steel canisters",
      "frame_material": "Perforated wood matrix tray",
      "color_name": "Natural Oak / Brushed Steel",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.75
    },
    "two_d_representation": {
      "symbol_type": "array_of_circles",
      "footprint_shape": "Rectangle 510x470 with 4x4 grid of circular 1kg canister cutouts"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "6000-9000 tris",
      "articulations": [
        "canisters_individually_removable"
      ]
    },
    "tags": [
      "grain jars",
      "1kg canisters",
      "deep drawer",
      "600mm drawer",
      "canister matrix"
    ],
    "vendor": "Modular Systems",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_CAN_600_9B",
    "item_name": "Modular Drawer Bulk Canister Matrix (600mm Drawer, 9x 2kg)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 510,
      "depth": 470,
      "height": 180,
      "estimated": false
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Large capacity stainless steel containers",
      "frame_material": "Perforated wood organizer base plate",
      "color_name": "Natural Birch / Stainless Steel",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.75
    },
    "two_d_representation": {
      "symbol_type": "array_of_circles",
      "footprint_shape": "Rectangle 510x470 with 3x3 array of 9 large diameter circular canisters"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "5000-7500 tris",
      "articulations": [
        "canisters_individually_removable"
      ]
    },
    "tags": [
      "bulk food",
      "2kg canisters",
      "600mm drawer",
      "kitchen organization"
    ],
    "vendor": "Modular Systems",
    "target_cabinet_width_mm": 600,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_CAN_900_28A",
    "item_name": "Modular Drawer Spice Canister Matrix (900mm Drawer, 28x 500g)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 810,
      "depth": 470,
      "height": 80,
      "estimated": false
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Stainless steel jars with transparent sealed tops",
      "frame_material": "Laser-cut organizer matrix board",
      "color_name": "Ochre Wood / Stainless Steel",
      "pbr_roughness_estimate": 0.3,
      "pbr_metalness_estimate": 0.7
    },
    "two_d_representation": {
      "symbol_type": "array_of_circles",
      "footprint_shape": "Wide rectangle 810x470 with 7 columns x 4 rows circular array (28 canisters)"
    },
    "three_d_requirements": {
      "lod_level": "high",
      "polygon_budget_target": "9000-14000 tris",
      "articulations": [
        "canisters_individually_removable"
      ]
    },
    "tags": [
      "spice matrix",
      "900mm drawer",
      "28 canisters",
      "gourmet kitchen",
      "pantry organizer"
    ],
    "vendor": "Modular Systems",
    "target_cabinet_width_mm": 900,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_CAN_900_15B",
    "item_name": "Modular Drawer Canister Matrix (900mm Drawer, 15x 2kg)",
    "category": {
      "primary": "Fixtures",
      "sub": "Drawer Inserts & Organizers"
    },
    "dimensions_mm": {
      "width": 810,
      "depth": 470,
      "height": 180,
      "estimated": false
    },
    "placement": {
      "type": "surface_top",
      "pivot_point": "bottom_center",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Food-grade stainless steel storage cylinders",
      "frame_material": "Perforated positioning wooden tray",
      "color_name": "Natural Oak / Brushed Steel",
      "pbr_roughness_estimate": 0.25,
      "pbr_metalness_estimate": 0.75
    },
    "two_d_representation": {
      "symbol_type": "array_of_circles",
      "footprint_shape": "Wide rectangle 810x470 with 5 columns x 3 rows circular array (15 canisters)"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "7500-10000 tris",
      "articulations": [
        "canisters_individually_removable"
      ]
    },
    "tags": [
      "bulk food",
      "900mm drawer",
      "2kg jars",
      "dry storage",
      "canister matrix"
    ],
    "vendor": "Modular Systems",
    "target_cabinet_width_mm": 900,
    "target_cabinet_type": "drawer"
  },
  {
    "asset_id": "KB_FL_DUO",
    "item_name": "Kesseb\u00f6hmer DUO / DUO Forte Flap Stay & Drop-Down Fitting",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 37,
      "depth": 220,
      "height": 220,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 400,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Die-cast zinc alloy",
      "frame_material": "Nickel-plated steel linkage arm",
      "color_name": "Polished Nickel",
      "pbr_roughness_estimate": 0.2,
      "pbr_metalness_estimate": 0.95
    },
    "two_d_representation": {
      "symbol_type": "line_and_pivot_symbol",
      "footprint_shape": "Single line stay arm showing 75\u00b0, 90\u00b0, and 110\u00b0 opening radial arcs"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3000-4500 tris",
      "articulations": [
        "elbow_joint_pivot",
        "carcase_bracket_swivel",
        "stopping_force_adjustment"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "duo",
      "duo forte",
      "flap stay",
      "lift-up front",
      "drop-down flap"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_MAXI",
    "item_name": "Kesseb\u00f6hmer MAXI Soft-Lift Flap Fitting",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 34,
      "depth": 185,
      "height": 192,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 450,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Die-cast zinc and steel arm",
      "frame_material": "Internal hydraulic damping cylinder",
      "color_name": "Nickel Plated",
      "pbr_roughness_estimate": 0.2,
      "pbr_metalness_estimate": 0.95
    },
    "two_d_representation": {
      "symbol_type": "line_and_pivot_symbol",
      "footprint_shape": "L-bracket footprint 185x34 with multi-angle opening arc"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5000 tris",
      "articulations": [
        "scissor_arm_lift",
        "soft_closing_damper"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "maxi",
      "soft lift",
      "heavy front",
      "wall unit fitting"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_FREEFOLD",
    "item_name": "Kesseb\u00f6hmer FREEfold Bi-Fold Wall Cabinet Lifter",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 35,
      "depth": 288,
      "height": 270,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 550,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Nickel-plated steel and aluminum arm",
      "frame_material": "Textured plastic dress cover",
      "color_name": "Grey RAL 7035 / Polished Chrome",
      "pbr_roughness_estimate": 0.3,
      "pbr_metalness_estimate": 0.7
    },
    "two_d_representation": {
      "symbol_type": "mechanism_compound_symbol",
      "footprint_shape": "Compound folding link arm mechanism 288x35 on carcase side"
    },
    "three_d_requirements": {
      "lod_level": "high",
      "polygon_budget_target": "6000-8500 tris",
      "articulations": [
        "dual_panel_bifold_elevation",
        "multi_position_stopp",
        "center_hinge_anti_pinch"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "freefold",
      "bi-fold",
      "tall wall unit",
      "lifter",
      "multi-position stop"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_FREESWING",
    "item_name": "Kesseb\u00f6hmer FREEswing Up-and-Over Flap Fitting",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 36,
      "depth": 273,
      "height": 211,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 600,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Anodized aluminum connecting rod and steel swing arms",
      "frame_material": "Molded polymer cover caps",
      "color_name": "Grey 7035 / Silver Anodized",
      "pbr_roughness_estimate": 0.35,
      "pbr_metalness_estimate": 0.6
    },
    "two_d_representation": {
      "symbol_type": "mechanism_compound_symbol",
      "footprint_shape": "Up-and-over curved trajectory envelope over cabinet top panel"
    },
    "three_d_requirements": {
      "lod_level": "high",
      "polygon_budget_target": "5500-8000 tris",
      "articulations": [
        "over_cabinet_swing_arc",
        "multi_position_stopp",
        "crossbar_synchronization"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "freeswing",
      "up-and-over",
      "medium and large fronts",
      "cornice clearance"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_FREESLIDE",
    "item_name": "Kesseb\u00f6hmer FREEslide Vertical Parallel Lifter",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 36,
      "depth": 277,
      "height": 152,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 250,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Precision extruded aluminum guide rails and steel swing arms",
      "frame_material": "Polymer protective dress covers",
      "color_name": "Grey 7035 / Satin Nickel",
      "pbr_roughness_estimate": 0.3,
      "pbr_metalness_estimate": 0.7
    },
    "two_d_representation": {
      "symbol_type": "mechanism_compound_symbol",
      "footprint_shape": "Parallel vertical track profile 277x36 along cabinet side wall"
    },
    "three_d_requirements": {
      "lod_level": "high",
      "polygon_budget_target": "5500-8500 tris",
      "articulations": [
        "vertical_parallel_slide_elevation",
        "multi_position_stopp"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "freeslide",
      "parallel lift",
      "stacked units",
      "appliance garage"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_FREEFLAP_M",
    "item_name": "Kesseb\u00f6hmer FREEflap Mini Compact Flap Lifter",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 34,
      "depth": 107,
      "height": 167,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 400,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "High-tensile spring steel mechanism",
      "frame_material": "Molded polymer cover housing",
      "color_name": "Grey RAL 7035 / White",
      "pbr_roughness_estimate": 0.35,
      "pbr_metalness_estimate": 0.3
    },
    "two_d_representation": {
      "symbol_type": "line_and_pivot_symbol",
      "footprint_shape": "Ultra-compact profile 107x34 with 107\u00b0 upward rotational sweep"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3000-4500 tris",
      "articulations": [
        "107_degree_flap_lift",
        "integrated_90_degree_limiter",
        "multi_position_stopp"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "freeflap mini",
      "compact lifter",
      "shallow cabinet",
      "118mm depth"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_FREEFLAP_F",
    "item_name": "Kesseb\u00f6hmer FREEflap Forte Heavy-Duty Flap Lifter",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 34,
      "depth": 130,
      "height": 184,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 450,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Heavy-duty dual spring steel mechanism",
      "frame_material": "Engineered polymer protective cover",
      "color_name": "Grey RAL 7035 / White",
      "pbr_roughness_estimate": 0.35,
      "pbr_metalness_estimate": 0.35
    },
    "two_d_representation": {
      "symbol_type": "line_and_pivot_symbol",
      "footprint_shape": "Compact casing 130x34 with 107\u00b0 upward rotation clearance"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5000 tris",
      "articulations": [
        "107_degree_flap_lift",
        "heavy_door_counterbalance_stopp"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "freeflap forte",
      "heavy duty lifter",
      "27kg capacity",
      "wall cabinet"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_FREELIGHT",
    "item_name": "Kesseb\u00f6hmer FREElight Simple Mechanical Flap Lifter",
    "category": {
      "primary": "Fixtures",
      "sub": "Cabinet Flap & Lifter Hardware"
    },
    "dimensions_mm": {
      "width": 32,
      "depth": 165,
      "height": 215,
      "estimated": false
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 400,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Zinc alloy link arm with ClickFixx quick clip bracket",
      "frame_material": "Thermoplastic dress cover and adjustment dial",
      "color_name": "Grey 7035 / Ice White 9966",
      "pbr_roughness_estimate": 0.4,
      "pbr_metalness_estimate": 0.45
    },
    "two_d_representation": {
      "symbol_type": "line_and_pivot_symbol",
      "footprint_shape": "Slim stay arm 165x32 with multi-stop radial travel"
    },
    "three_d_requirements": {
      "lod_level": "low",
      "polygon_budget_target": "2000-3500 tris",
      "articulations": [
        "multi_position_angle_stop",
        "clickfixx_clip_detach"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "freelight",
      "entry-level lifter",
      "clickfixx",
      "allen key adjust"
    ],
    "vendor": "Kesseb\u00f6hmer",
    "target_cabinet_type": "wall"
  },
  {
    "asset_id": "KB_FL_ETOUCH",
    "item_name": "Kesseb\u00f6hmer eTouch Electronic Motorized Drive Unit for FREElift",
    "category": {
      "primary": "Fixtures",
      "sub": "Electronic Cabinet Hardware"
    },
    "dimensions_mm": {
      "width": 65,
      "depth": 240,
      "height": 180,
      "estimated": true
    },
    "placement": {
      "type": "wall_mounted",
      "pivot_point": "back_flush",
      "clearance_mm": {
        "front": 0,
        "sides": 0
      }
    },
    "materials_and_finish": {
      "primary_material": "Cast aluminum motor and gear gearbox",
      "frame_material": "Polymer protective enclosure with 24V DC power connector",
      "color_name": "Silver Cast / Light Grey Enclosure",
      "pbr_roughness_estimate": 0.35,
      "pbr_metalness_estimate": 0.8
    },
    "two_d_representation": {
      "symbol_type": "top_down_bounding_box",
      "footprint_shape": "Irregular gear casing footprint 240x65 fitted behind lifter dress cover"
    },
    "three_d_requirements": {
      "lod_level": "medium",
      "polygon_budget_target": "3500-5000 tris",
      "articulations": [
        "motorized_swing_arm_drive",
        "manual_override_clutch"
      ]
    },
    "tags": [
      "kesseb\u00f6hmer",
      "etouch",
      "motorized lift",
      "push to open",
      "integrated light control",
      "electric opener"
    ],
    "vendor": "Kesseb\u00f6hmer"
  }
] as const;
