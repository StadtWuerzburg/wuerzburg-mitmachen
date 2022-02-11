class Comments::CsvExporter
  require "csv"
  include JsonExporter

  def initialize(comments)
    @comments = comments
  end

  def to_csv
    CSV.generate(headers: true) do |csv|
      csv << headers

      @comments.each do |comment|
        csv << csv_values(comment)
      end
    end
  end

  private

    def headers
      [
        "commentable_id",
        "commentable_type",
        "subject",
        "user_id",
        "created_at",
        "updated_at",
        "hidden_at",
        "flags_count",
        "ignored_flag_at",
        "moderator_id",
        "administrator_id",
        "cached_votes_total",
        "cached_votes_up",
        "cached_votes_down",
        "confirmed_hide_at",
        "ancestry",
        "confidence_score",
        "valuation"
      ]
    end

    def csv_values(comment)
      [
        comment.commentable_id,
        comment.commentable_type,
        comment.subject,
        comment.user_id,
        comment.created_at,
        comment.updated_at,
        comment.hidden_at,
        comment.flags_count,
        comment.ignored_flag_at,
        comment.moderator_id,
        comment.administrator_id,
        comment.cached_votes_total,
        comment.cached_votes_up,
        comment.cached_votes_down,
        comment.confirmed_hide_at,
        comment.ancestry,
        comment.confidence_score,
        comment.valuation
      ]
    end
end
