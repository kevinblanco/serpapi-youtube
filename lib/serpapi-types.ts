// Response shapes for the SerpApi YouTube engines this project calls.
// Only the fields we read are typed, and every field is optional because
// SerpApi omits keys it can't fill. Field names follow SerpApi's docs:
//   youtube_channel          https://serpapi.com/youtube-channel-api
//   youtube_video            https://serpapi.com/youtube-video-api
//   youtube_video_transcript https://serpapi.com/youtube-video-transcript-api
//   youtube (search)         https://serpapi.com/youtube-search-api

export interface SearchMetadata {
  id?: string;
  status?: "Processing" | "Success" | "Error";
  total_time_taken?: number;
}

export interface Pagination {
  next_page_token?: string;
  next?: string;
}

export interface Thumbnail {
  static?: string;
  rich?: string;
}

export interface ChannelResults {
  title?: string;
  handle?: string;
  description?: string;
  keywords?: string[] | string;
  external_id?: string;
  link?: string;
  subscribers_text?: string;
  subscribers?: number;
  videos_text?: string;
  video_count?: number;
  thumbnail?: string;
  thumbnails?: { url: string; width?: number; height?: number }[];
  country?: string;
  joined_date?: string;
  total_views_text?: string;
  total_views?: number;
  links?: { title?: string; link?: string }[];
}

export interface ChannelVideo {
  position?: number;
  title?: string;
  link?: string;
  serpapi_link?: string;
  video_id?: string;
  description?: string;
  views?: number | string;
  extracted_views?: number;
  published_date?: string;
  length?: string;
  thumbnail?: Thumbnail | string;
  // streams tab
  live?: boolean;
  upcoming?: boolean;
  scheduled_for?: string;
}

export interface ChannelShort {
  position?: number;
  title?: string;
  link?: string;
  video_id?: string;
  views?: number | string;
  extracted_views?: number;
  thumbnail?: Thumbnail | string;
}

export interface YouTubeChannelResponse {
  search_metadata?: SearchMetadata;
  channel_results?: ChannelResults;
  videos_results?: ChannelVideo[];
  shorts_results?: ChannelShort[];
  streams_results?: ChannelVideo[];
  serpapi_pagination?: Pagination;
  error?: string;
}

export interface YouTubeVideoResponse {
  search_metadata?: SearchMetadata;
  title?: string;
  thumbnail?: string;
  channel?: {
    name?: string;
    link?: string;
    thumbnail?: string;
    subscribers?: string;
    extracted_subscribers?: number;
    verified?: boolean;
  };
  views?: string;
  extracted_views?: number;
  likes?: string;
  extracted_likes?: number;
  live?: boolean;
  published_date?: string;
  description?: {
    content?: string;
    links?: { text?: string; url?: string; type?: string }[];
  };
  chapters?: { title?: string; time_start?: number; thumbnail?: string }[];
  comment_count?: string;
  extracted_comment_count?: number;
  error?: string;
}

export interface YouTubeTranscriptResponse {
  search_metadata?: SearchMetadata;
  transcript?: {
    start_ms?: number;
    end_ms?: number;
    snippet?: string;
    start_time_text?: string;
  }[];
  chapters?: { chapter?: string; start_ms?: number; end_ms?: number }[];
  available_transcripts?: {
    title?: string;
    language_name?: string;
    language_code?: string;
    type?: string;
    selected?: boolean;
  }[];
  error?: string;
}

export interface YouTubeSearchVideo {
  position_on_page?: number;
  title?: string;
  link?: string;
  video_id?: string;
  channel?: { name?: string; link?: string; verified?: boolean; thumbnail?: string };
  published_date?: string;
  views?: number | string;
  length?: string;
  description?: string;
  extensions?: string[];
  thumbnail?: Thumbnail | string;
}

export interface YouTubeSearchResponse {
  search_metadata?: SearchMetadata;
  video_results?: YouTubeSearchVideo[];
  error?: string;
}

export interface AccountResponse {
  account_email?: string;
  plan_name?: string;
  searches_per_month?: number;
  plan_searches_left?: number;
  extra_credits?: number;
  total_searches_left?: number;
  this_month_usage?: number;
  this_hour_searches?: number;
  account_rate_limit_per_hour?: number;
  error?: string;
}
